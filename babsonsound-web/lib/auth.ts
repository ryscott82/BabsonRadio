import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword,
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

// ── Passwordless (the default way in) ─────────────────────────

/** Step 1: "Email me a link". Works for new and returning people; the account is made when they tap the link. */
export async function requestEmailLink(email: string) {
  const e = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(e)) throw fail('Enter a valid email address.', 'BR-ACC-009')
  await api('/api/auth/link', { email: e })
}

/** True when the current page address is a sign-in link from that email (use on /auth/link). */
export const isEmailLink = (href = typeof window === 'undefined' ? '' : window.location.href) => isSignInWithEmailLink(auth, href)

/**
 * Step 2, on /auth/link: signs in with the link in the address bar, then makes the profile on the first visit.
 * The address is read from ?e= in the link, so it works even when the link is opened on another device.
 */
export async function completeEmailLink(opts: { launchNotice?: boolean } = {}) {
  const url = new URL(window.location.href)
  const email = (url.searchParams.get('e') ?? '').toLowerCase()
  if (!email || !isSignInWithEmailLink(auth, url.href)) throw fail('That sign-in link did not work. Ask for a new one.', 'BR-AUTH-002')
  try {
    const { user } = await signInWithEmailLink(auth, email, url.href)
    await api('/api/auth/init', { agreed: true, launchNotice: opts.launchNotice !== false })
    return user
  } catch (e) {
    throw fbFail(e, 'That link has expired or was already used. Ask for a new one.')
  }
}

/** Optional: lets someone who signed in with a link also sign in with a password (needs a recent sign-in). */
export async function setMyPassword(password: string) {
  if (!auth.currentUser) throw fail('Sign in first.', 'BR-AUTH-002')
  if (password.length < 8 || password.length > 128) throw fail('Password must be 8–128 characters.', 'BR-ACC-009')
  try { await updatePassword(auth.currentUser, password) }
  catch (e) { throw fbFail(e, 'Could not set the password. Sign in again with a new link and retry.') }
}

/** Password sign-up (the "use a password instead" option). Account creation happens server-side; then we sign in and send the verify email. */
export async function signUp(email: string, password: string, firstName = '', lastName = '', phone = '', gradYear = '') {
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
/** True when this account has a password (accounts made with an emailed link may not). */
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
  // Link-only accounts have no password to check. The server still needs a sign-in from the last 5 minutes.
  await api('/api/me/delete', { confirm: 'DELETE' })
  await firebaseSignOut(auth).catch(() => {})
}

export async function signOut() {
  await firebaseSignOut(auth)
  forgetLaunchPass()
}

// ── launch pass (before launch only) ──
// Admins, directors and radio-trained students trade their sign-in for a pass (an HttpOnly
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
