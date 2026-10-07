import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
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

export function isBabsonEmail(email: string): boolean {
  return /^[^\s@]+@babson\.edu$/i.test(email.trim())
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
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

// ── Babson students ───────────────────────────────────────────

/** Account creation happens server-side (enforces babson.edu); then we sign in and send the verify email. */
export async function signUp(email: string, password: string, firstName: string, phone: string) {
  if (!isBabsonEmail(email)) throw fail('Babson Radio requires a @babson.edu email address.', 'BR-ACC-001')
  await api('/api/auth/signup', { email, password, firstName, phone })
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    await sendEmailVerification(user).catch(() => {})
    return user
  } catch (e) {
    throw fbFail(e, 'Account created, but sign-in failed. Try signing in.')
  }
}

export async function signIn(email: string, password: string) {
  if (!isBabsonEmail(email)) throw fail('Sign in with your @babson.edu email. Not a student? Use guest access.', 'BR-ACC-001')
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    return user
  } catch (e) {
    throw fbFail(e, 'Incorrect email or password.')
  }
}

export async function resendVerification() {
  if (!auth.currentUser) throw fail('Sign in first.', 'BR-AUTH-002')
  await sendEmailVerification(auth.currentUser)
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
  if (isBabsonEmail(email)) throw fail('You have a Babson email. Create a student account instead.', 'BR-ACC-001')
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
  return user
}

export async function guestSignIn(email: string, password: string) {
  if (isBabsonEmail(email)) throw fail('Use the student sign-in with your @babson.edu email.', 'BR-ACC-001')
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

export async function sendPasswordReset(email: string) {
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
}

export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}
