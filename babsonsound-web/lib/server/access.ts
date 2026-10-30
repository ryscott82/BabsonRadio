import 'server-only'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { createHash } from 'node:crypto'
import { adminDb } from './admin'
import { isListedOwner, isVerifiedOwner } from '../ownerRule'
import { badgeActive } from '../studioRules'

/** One access level per person. */
export type Level = 'guest' | 'student' | 'director' | 'admin'
export const LEVELS: Level[] = ['guest', 'student', 'director', 'admin']

/** Exact school domains. Subdomains (students.babson.edu) are NOT matched, same as the old BABSON_EMAIL rule. */
export const SCHOOL_EMAIL = /^[a-z0-9._%+-]+@(babson|olin|wellesley)\.edu$/
export const isSchoolEmail = (e?: string | null) => !!e && SCHOOL_EMAIL.test(e.toLowerCase())
export const schoolOf = (e?: string | null) => (e ? e.toLowerCase().match(/@(babson|olin|wellesley)\.edu$/)?.[1] ?? null : null)

/** Owner accounts (env OWNER_EMAILS, comma separated). Cannot be demoted or deleted by anyone else. */
export const ownerEmails = () => (process.env.OWNER_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
export const isOwnerEmail = (e?: string | null) => isListedOwner(e, ownerEmails())

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
  /** When the Studio / Radio badge runs out (ms), or null when it has no date. Directors and admins have none. */
  studioExpiresAt: number | null
  radioExpiresAt: number | null
  /** True when the person holds the badge but it ran out (so the app can say "renew" instead of "get trained"). */
  studioExpired: boolean
  radioExpired: boolean
}

/** Roles given to an email before it has an account: roleInvites/{sha256(email)}. */
export const inviteKey = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/**
 * The first time a person is seen with a VERIFIED email, any invite for that email is moved onto their profile.
 * (Unverified sign-ups never get one, so nobody can claim an invited address before its owner.) Runs once per account.
 */
async function claimInvite(email: string, doc: FirebaseFirestore.DocumentSnapshot): Promise<Record<string, unknown>> {
  const db = adminDb()
  const ref = db.collection('roleInvites').doc(inviteKey(email))
  const inv = await ref.get()
  const patch: Record<string, unknown> = { inviteChecked: true }
  if (inv.exists) {
    patch.level = LEVELS.includes(inv.get('level')) ? inv.get('level') : 'student'
    if (typeof inv.get('studioTrained') === 'boolean') patch.studioTrained = inv.get('studioTrained')
    if (typeof inv.get('radioTrained') === 'boolean') patch.radioTrained = inv.get('radioTrained')
    await ref.delete()
  }
  await doc.ref.update(patch)
  return patch
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
  const claimed = doc.exists && t.email_verified === true && email && doc.get('inviteChecked') !== true ? await claimInvite(email, doc) : {}
  const field = (k: string) => (k in claimed ? claimed[k] : doc.get(k))
  // Owner power needs a verified email: an unverified owner address is treated like any other account.
  const owner = isVerifiedOwner(email, t.email_verified, ownerEmails())
  const demo = doc.get('demo') === true
  const graceOk = typeof t.graceUntil === 'number' && now < t.graceUntil
  const schoolVerified = isSchoolEmail(email) && (t.email_verified === true || graceOk)

  let level: Level = LEVELS.includes(field('level') as Level) ? (field('level') as Level) : levelFromLegacy(doc.get('role'), email)
  if (owner) level = 'admin'
  // A level above guest counts for a verified school email (7-day grace allowed), or any other email once it is verified
  // (an admin granted it by hand: sign-up makes every non-school address a guest), or the demo account, or an owner.
  const trusted = schoolVerified || t.email_verified === true || demo || owner
  if (level !== 'guest' && !trusted) level = 'guest'

  const high = level === 'admin' || level === 'director'
  // Badges from Studio training run out on a date (users.studioExpiresAt / radioExpiresAt). No date = the old flow, never expires.
  const expiry = (k: string): number | null => { const v = field(k) as { toMillis?: () => number } | null | undefined; return v?.toMillis?.() ?? null }
  const studioExp = high ? null : expiry('studioExpiresAt'), radioExp = high ? null : expiry('radioExpiresAt')
  const studioFlag = level === 'student' && field('studioTrained') === true
  const radioFlag = level === 'student' && field('radioTrained') === true
  const a: Access = {
    uid: t.uid, level, owner, demo, schoolVerified: schoolVerified || demo,
    studio: high || (studioFlag && badgeActive(studioExp, now)),
    radio: high || (radioFlag && badgeActive(radioExp, now)),
    studioExpiresAt: studioExp, radioExpiresAt: radioExp,
    studioExpired: studioFlag && !badgeActive(studioExp, now),
    radioExpired: radioFlag && !badgeActive(radioExp, now),
  }
  if (cache.size > 2000) cache.clear()
  cache.set(t.uid, { at: now, a })
  return a
}

export const rank = (l: Level) => LEVELS.indexOf(l)
