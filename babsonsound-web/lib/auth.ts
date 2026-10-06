import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

export const BABSON_DOMAIN = '@babson.edu'

export function isBabsonEmail(email: string): boolean {
  return /^[^\s@]+@babson\.edu$/i.test(email.trim())
}

/** POST JSON to one of our API routes with the user's ID token (if signed in). */
export async function api<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
  return data as T
}

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

// ── Guests (passwordless email link) ──────────────────────────

const GUEST_KEY = 'br_guest_pending'

export async function sendGuestLink(email: string, name: string, sponsorEmail: string) {
  if (isBabsonEmail(email)) throw new Error('You have a Babson email — sign in with it instead.')
  if (sponsorEmail && !isBabsonEmail(sponsorEmail)) throw new Error("Enter the Babson student's @babson.edu email.")
  await sendSignInLinkToEmail(auth, email.trim(), {
    url: `${window.location.origin}/auth/guest`,
    handleCodeInApp: true,
  })
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ email: email.trim(), name, sponsorEmail }))
  } catch {}
}

export function readPendingGuest(): { email: string; name: string; sponsorEmail: string } | null {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null')
  } catch {
    return null
  }
}
export function clearPendingGuest() {
  try { localStorage.removeItem(GUEST_KEY) } catch {}
}

export const isGuestLink = (url: string) => isSignInWithEmailLink(auth, url)

export async function completeGuestLink(email: string, url: string) {
  const { user } = await signInWithEmailLink(auth, email.trim(), url)
  return user
}

// ── Shared ────────────────────────────────────────────────────

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
