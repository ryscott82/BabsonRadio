import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { withCode, firebaseAuthCode, messageForCode } from './errors'

const fail = (message: string, code: string) => new Error(withCode(message, code))
/** Error for a failed Firebase client call, with a support code. */
const fbFail = (e: unknown, fallback: string) => {
  const code = firebaseAuthCode(e)
  return fail(messageForCode(code, fallback), code)
}

export const BABSON_DOMAIN = '@babson.edu'
/** Schools whose students can use Babson Radio. The first is the default in the email dropdown. */
export const SCHOOL_DOMAINS = ['@babson.edu', '@olin.edu', '@wellesley.edu'] as const

/** True for a Babson, Olin or Wellesley address. */
export function isBabsonEmail(email: string): boolean {
  return /^[^\s@]+@(babson|olin|wellesley)\.edu$/i.test(email.trim())
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE' | 'PATCH', path: string, body?: unknown, anon = false): Promise<T> {
  const token = anon ? undefined : await auth.currentUser?.getIdToken()
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw fail("Can't reach Babson Radio. Check your connection.", 'BR-CLI-001')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(withCode(data?.error ?? 'Something went wrong.', data?.code ?? 'BR-SRV-000', data?.ref))
  if (data === null) throw fail('Unexpected reply from the server.', 'BR-CLI-004')
  return data as T
}

/** POST JSON to one of our API routes with the user's ID token (if signed in). */
export const api = <T = Record<string, unknown>>(path: string, body: unknown) => request<T>('POST', path, body)
export const apiGet = <T = Record<string, unknown>>(path: string) => request<T>('GET', path)
/** GET without the sign-in header, for public data. Requests with a header can not be cached by Vercel's edge, so crowds would each cost CPU. */
export const apiGetPublic = <T = Record<string, unknown>>(path: string) => request<T>('GET', path, undefined, true)
/** POST a form (file pieces) to one of our API routes with the user's ID token. */
export async function apiUpload<T = Record<string, unknown>>(path: string, form: FormData): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  let res: Response
  try { res = await fetch(path, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form }) }
  catch { throw fail("Can't reach Babson Radio. Check your connection.", 'BR-CLI-001') }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(withCode(data?.error ?? (res.status === 413 ? 'That piece was too big for the site.' : 'Something went wrong.'), data?.code ?? 'BR-SRV-000', data?.ref))
  if (data === null) throw fail('Unexpected reply from the server.', 'BR-CLI-004')
  return data as T
}
/** PATCH JSON to one of our API routes (a partial change, like Admin > Settings). */
export const apiPatch = <T = Record<string, unknown>>(path: string, body: unknown) => request<T>('PATCH', path, body)
export const apiDelete = <T = Record<string, unknown>>(path: string, body: unknown) => request<T>('DELETE', path, body)

// ── Babson students ───────────────────────────────────────────

/** Sign-up: email and password only. Account creation happens server-side; then we sign in and send the verify email. Everything else (name, avatar, birthday...) is asked later, one step at a time (lib/setup.ts). */
export async function signUp(email: string, password: string, firstName = '', lastName = '', phone = '', gradYear = '', captchaToken = '') {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw fail('Enter a valid email address.', 'BR-ACC-009')
  await api('/api/auth/signup', { email, password, firstName, lastName, phone, gradYear, agreed: true, ...(captchaToken ? { captchaToken } : {}) })
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    await sendEmailVerification(user).catch(e => console.error('[verification email failed]', e))
    return user
  } catch (e) {
    throw fbFail(e, 'Account created, but sign-in failed. Try signing in.')
  }
}

export async function signIn(email: string, password: string) {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    return user
  } catch (e) {
    throw fbFail(e, 'Incorrect email or password.')
  }
}

export async function resendVerification() {
  if (!auth.currentUser) throw fail('Sign in first.', 'BR-AUTH-002')
  try { await sendEmailVerification(auth.currentUser) }
  catch (e) { throw fbFail(e, 'Could not send the email. Try again in a minute.') }
}

/** Pick up emailVerified after the user clicks the link; forces a fresh ID token. */
export async function refreshUser(): Promise<User | null> {
  const u = auth.currentUser
  if (!u) return null
  await u.reload()
  await u.getIdToken(true)
  return auth.currentUser
}

// ── Shared ────────────────────────────────────────────────────

// One reset email per address every few minutes (and a short pause between any two), so the button can not be mashed.
// This lives in the browser; Firebase also throttles repeated requests on its own side.
const RESET_WAIT_MS = 3 * 60_000
const RESET_ANY_MS = 20_000
const resetKey = (email: string) => `br_reset_${email.trim().toLowerCase()}`

/** Seconds until another reset email may be requested for this address (0 = go ahead). */
export function resetSecondsLeft(email: string): number {
  try {
    const now = Date.now()
    const a = Number(localStorage.getItem(resetKey(email)) ?? 0) + RESET_WAIT_MS - now
    const b = Number(localStorage.getItem('br_reset_any') ?? 0) + RESET_ANY_MS - now
    return Math.max(0, Math.ceil(Math.max(a, b) / 1000))
  } catch { return 0 }
}

export async function sendPasswordReset(email: string) {
  const left = resetSecondsLeft(email)
  if (left > 0) {
    const m = Math.floor(left / 60), s = String(left % 60).padStart(2, '0')
    throw fail(`A reset link was just sent. You can ask for another in ${m}:${s}.`, 'BR-ACC-010')
  }
  try {
    const now = String(Date.now())
    localStorage.setItem(resetKey(email), now); localStorage.setItem('br_reset_any', now)
  } catch { /* private window: no cooldown, Firebase still throttles */ }
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/invalid-email') throw fail('Enter a valid email address.', 'BR-ACC-009')
    // Otherwise stay quiet: we never reveal whether an account exists.
  }
}

/** Permanently deletes the signed-in account and its data. Re-checks the password first. */
/** True when this account has a password (every account made here does). */
export const hasPassword = () => !!auth.currentUser?.providerData.some(p => p.providerId === 'password')

export async function deleteMyAccount(password = '') {
  const u = auth.currentUser
  if (!u?.email) throw fail('Sign in first.', 'BR-AUTH-002')
  if (hasPassword()) {
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password))
    } catch (e) {
      throw fbFail(e, 'Incorrect password.')
    }
    await u.getIdToken(true)
  }
  // The server needs a sign-in from the last 5 minutes (the check above just made one).
  const r = await api<{ kept?: boolean; message?: string }>('/api/me/delete', { confirm: 'DELETE' })
  // The App Review demo account is never deleted: show the friendly message and stay signed in.
  if (r.kept) throw new Error(r.message || 'This is a demo account, so nothing was deleted.')
  await firebaseSignOut(auth).catch(() => {})
}

export async function signOut() {
  await firebaseSignOut(auth)
}

export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

/**
 * A guest who is a student adds their school email. We save their details, then Firebase emails a confirmation link to the
 * school address. Once they click it, the sign-in email becomes the school one, so they sign in again with it.
 */
export async function addSchoolEmail(args: { email: string; password: string; firstName: string; lastName: string; gradYear: string }) {
  const u = auth.currentUser
  if (!u || !u.email) throw fail('Sign in first.', 'BR-AUTH-002')
  const email = args.email.trim().toLowerCase()
  if (!isBabsonEmail(email)) throw fail('Use your Babson, Olin or Wellesley email.', 'BR-ACC-001')
  try { await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, args.password)) }
  catch (e) { throw fbFail(e, 'That password is not right.') }
  await api('/api/me/school-email', { email, firstName: args.firstName, lastName: args.lastName, gradYear: args.gradYear })
  try { await verifyBeforeUpdateEmail(u, email) }
  catch (e) { throw fbFail(e, 'Could not send the link. Try again in a minute.') }
}
