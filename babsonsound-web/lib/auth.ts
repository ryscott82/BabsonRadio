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

export const BABSON_DOMAIN = '@babson.edu'

export function isBabsonEmail(email: string): boolean {
  return /^[^\s@]+@babson\.edu$/i.test(email.trim())
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
  return data as T
}

/** POST JSON to one of our API routes with the user's ID token (if signed in). */
export const api = <T = Record<string, unknown>>(path: string, body: unknown) => request<T>('POST', path, body)
export const apiGet = <T = Record<string, unknown>>(path: string) => request<T>('GET', path)

// ── Babson students ───────────────────────────────────────────

/** Account creation happens server-side (enforces babson.edu); then we sign in and send the verify email. */
export async function signUp(email: string, password: string, firstName: string, phone: string) {
  if (!isBabsonEmail(email)) throw new Error('Babson Radio requires a @babson.edu email address.')
  await api('/api/auth/signup', { email, password, firstName, phone })
  const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  await sendEmailVerification(user)
  return user
}

export async function signIn(email: string, password: string) {
  if (!isBabsonEmail(email)) throw new Error('Sign in with your @babson.edu email. Not a student? Use guest access.')
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    return user
  } catch {
    throw new Error('Incorrect email or password.')
  }
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error('Sign in first.')
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
  if (isBabsonEmail(email)) throw new Error('You have a Babson email. Create a student account instead.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  let user: User
  try {
    ;({ user } = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password))
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/email-already-in-use') throw new Error('An account with that email already exists. Try signing in.')
    if (code === 'auth/invalid-email') throw new Error('Enter a valid email address.')
    if (code === 'auth/weak-password') throw new Error('That password is too weak.')
    throw new Error('Could not create the account. Please try again.')
  }
  await updateProfile(user, { displayName: name.trim() || 'Guest' })
  await sendEmailVerification(user).catch(() => {})
  await user.getIdToken(true)
  await apiGet('/api/guest/status') // first call starts the one-time live trial
  return user
}

export async function guestSignIn(email: string, password: string) {
  if (isBabsonEmail(email)) throw new Error('Use the student sign-in with your @babson.edu email.')
  let user: User
  try {
    ;({ user } = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password))
  } catch {
    throw new Error('Incorrect email or password.')
  }
  await apiGet('/api/guest/status').catch(() => {})
  return user
}

// ── Shared ────────────────────────────────────────────────────

export async function sendPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/invalid-email') throw new Error('Enter a valid email address.')
    // Otherwise stay quiet: we never reveal whether an account exists.
  }
}

/** Permanently deletes the signed-in account and its data. Re-checks the password first. */
export async function deleteMyAccount(password: string) {
  const u = auth.currentUser
  if (!u?.email) throw new Error('Sign in first.')
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password))
  } catch {
    throw new Error('Incorrect password.')
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
