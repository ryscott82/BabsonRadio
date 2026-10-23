import 'server-only'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminDb } from './admin'

/** One access level per person. */
export type Level = 'guest' | 'student' | 'director' | 'admin'
export const LEVELS: Level[] = ['guest', 'student', 'director', 'admin']

/** Exact school domains. Subdomains (students.babson.edu) are NOT matched, same as the old BABSON_EMAIL rule. */
export const SCHOOL_EMAIL = /^[a-z0-9._%+-]+@(babson|olin|wellesley)\.edu$/
export const isSchoolEmail = (e?: string | null) => !!e && SCHOOL_EMAIL.test(e.toLowerCase())
export const schoolOf = (e?: string | null) => (e ? e.toLowerCase().match(/@(babson|olin|wellesley)\.edu$/)?.[1] ?? null : null)

/** Owner accounts (env OWNER_EMAILS, comma separated). Cannot be demoted or deleted by anyone else. */
export const ownerEmails = () => (process.env.OWNER_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
export const isOwnerEmail = (e?: string | null) => !!e && ownerEmails().includes(e.toLowerCase())

/** Map an old `role` value to the new level (fallback before migration, and used by the migration script). */
export function levelFromLegacy(role: unknown, email: string | null | undefined): Level {
  if (role === 'admin' || role === 'superAdmin' || role === 'developer') return 'admin'
  if (role === 'director') return 'director'
  return isSchoolEmail(email) ? 'student' : 'guest'
}

export type Access = {
  uid: string
  level: Level
  studio: boolean
  radio: boolean
  owner: boolean
  demo: boolean
  schoolVerified: boolean
}

const cache = new Map<string, { at: number; a: Access }>()
const TTL = 45_000
export const forgetAccess = (uid?: string) => { if (uid) cache.delete(uid); else cache.clear() }

/** Effective access for a verified token. One Firestore read, cached ~45 seconds per person. */
export async function accessOf(t: DecodedIdToken): Promise<Access> {
  const hit = cache.get(t.uid)
  const now = Date.now()
  if (hit && now - hit.at < TTL) return hit.a
  const doc = await adminDb().collection('users').doc(t.uid).get()
  const email = (t.email ?? doc.get('email') ?? '').toLowerCase()
  const owner = isOwnerEmail(email)
  const demo = doc.get('demo') === true
  const graceOk = typeof t.graceUntil === 'number' && now < t.graceUntil
  const schoolVerified = isSchoolEmail(email) && (t.email_verified === true || graceOk)

  let level: Level = LEVELS.includes(doc.get('level')) ? doc.get('level') : levelFromLegacy(doc.get('role'), email)
  if (owner) level = 'admin'
  // Elevated levels only count for a verified school email, the demo account, or an owner.
  if ((level === 'admin' || level === 'director') && !(schoolVerified || demo || owner)) level = 'guest'
  // Students must have a verified school email; the demo account counts as verified.
  if (level === 'student' && !(schoolVerified || demo)) level = 'guest'

  const high = level === 'admin' || level === 'director'
  const a: Access = {
    uid: t.uid, level, owner, demo, schoolVerified: schoolVerified || demo,
    studio: high || (level === 'student' && doc.get('studioTrained') === true),
    radio: high || (level === 'student' && doc.get('radioTrained') === true),
  }
  if (cache.size > 2000) cache.clear()
  cache.set(t.uid, { at: now, a })
  return a
}

export const rank = (l: Level) => LEVELS.indexOf(l)
