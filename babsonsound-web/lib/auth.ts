import { TERMS_VERSION } from '@/lib/terms'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
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

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, anon = false): Promise<T> {
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
export const apiDelete = <T = Record<string, unknown>>(path: string, body: unknown) => request<T>('DELETE', path, body)

// ── Babson students ───────────────────────────────────────────

/** Account creation happens server-side (enforces babson.edu); then we sign in and send the verify email. */
export async function signUp(email: string, password: string, firstName: string, lastName: string, phone: string, gradYear: string) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw fail('Enter a valid email address.', 'BR-ACC-009')
  await api('/api/auth/signup', { email, password, firstName, lastName, phone, gradYear, agreed: true })
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

// ── Guests (email + password; free, no email-link setup) ─────
// Guests get LIVE radio only: an automatic trial, then a student-sponsored pass. Never the backlog.

export async function guestSignUp(email: string, password: string, name: string) {
  if (isBabsonEmail(email)) throw fail('You have a school email. Create a student account instead.', 'BR-ACC-001')
  if (password.length < 8) throw fail('Password must be at least 8 characters.', 'BR-ACC-005')
  let user: User
  try {
    ;({ user } = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password))
  } catch (e) {
    const code = firebaseAuthCode(e)
    const msg: Record<string, string> = {
      'BR-ACC-002': 'An account with that email already exists. Try signing in.',
      'BR-ACC-009': 'Enter a valid email address.',
      'BR-ACC-005': 'That password is too weak.',
    }
    throw fail(msg[code] ?? messageForCode(code, 'Could not create the account. Please try again.'), code)
  }
  await updateProfile(user, { displayName: name.trim() || 'Guest' })
  await sendEmailVerification(user).catch(() => {})
  await user.getIdToken(true)
  await apiGet('/api/guest/status') // first call starts the one-time live trial
  await api('/api/me', { acceptTerms: TERMS_VERSION }).catch(() => {}) // record that they agreed
  return user
}

export async function guestSignIn(email: string, password: string) {
  if (isBabsonEmail(email)) throw fail('Use the student sign-in with your school email.', 'BR-ACC-001')
  let user: User
  try {
    ;({ user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password))
  } catch (e) {
    throw fbFail(e, 'Incorrect email or password.')
  }
  await apiGet('/api/guest/status').catch(() => {})
  return user
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
export async function deleteMyAccount(password: string) {
  const u = auth.currentUser
  if (!u?.email) throw fail('Sign in first.', 'BR-AUTH-002')
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password))
  } catch (e) {
    throw fbFail(e, 'Incorrect password.')
  }
  await u.getIdToken(true)
  await api('/api/me/delete', { confirm: 'DELETE' })
  await firebaseSignOut(auth).catch(() => {})
}

export async function signOut() {
  await firebaseSignOut(auth)
  forgetLaunchPass()
}

// ── launch pass (before launch only) ──
// Developers, admins, directors, hosts, beta testers and early-access accounts trade their sign-in for a pass (an HttpOnly
// cookie) so the pages open for them. Locked accounts are told no and stay on the waiting screen. See /api/launch/pass.
const PASS_AT = 'br-pass-at', PASS_DENIED_AT = 'br-pass-denied-at'
const recent = (key: string, ms: number) => { try { return Date.now() - Number(sessionStorage.getItem(key) ?? 0) < ms } catch { return false } }
const mark = (key: string) => { try { sessionStorage.setItem(key, String(Date.now())) } catch { /* storage blocked */ } }

/** Asks for the pass if there is none yet. Quiet on failure; a person without early access never gets one. */
export async function ensureLaunchPass(force = false) {
  if (!force && (recent(PASS_AT, 10 * 3_600_000) || recent(PASS_DENIED_AT, 5 * 60_000))) return
  try {
    await api('/api/launch/pass', {})
    mark(PASS_AT)
  } catch { mark(PASS_DENIED_AT) }
}

/** Sign-out: drop the pass cookie and the reminders. */
function forgetLaunchPass() {
  try { sessionStorage.removeItem(PASS_AT); sessionStorage.removeItem(PASS_DENIED_AT) } catch { /* storage blocked */ }
  fetch('/api/launch/pass', { method: 'DELETE' }).catch(() => {})
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
