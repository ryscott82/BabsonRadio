import 'server-only'
import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { decryptJson, encryptJson } from './pii'
import { indexKeyFromE164 } from './phone'
import { isBlockedNumber } from '../phone'

// A student's phone number lives in three fields on users/{uid}, and nowhere else in plain text:
//   phoneEncrypted  AES-256-GCM (PII_KEY). Read only by readPhone(): the owner's own phone page and the admin phone-change flow.
//   phoneHash       HMAC-SHA256(PHONE_HASH_PEPPER, sha256(E.164)). Same value as the phoneIndex doc id, which is the unique index
//                   that contact matching looks up.
//   phoneVerified   false until a verification step exists. Matching ignores phoneIndex entries that are not verified.
// Neither the number nor the hash is ever sent to another member. Older accounts may still carry a plain `phoneNumber`;
// every reader below falls back to it, and the next save or removal replaces it.

export const PHONE_FIELDS = ['phoneEncrypted', 'phoneHash', 'phoneVerified', 'phoneNumber'] as const

export type PhoneFields = { phoneEncrypted: string; phoneHash: string; phoneVerified: false }

/** Babson's own lines are not people: nothing (not even a hash) is derived from them. */
export function assertPersonalNumber(e164: string): void {
  if (isBlockedNumber(e164)) throw new HttpError(400, 'That is a Babson campus line. Enter your own number.', 'BR-SET-009')
}

export async function phoneFields(e164: string): Promise<PhoneFields> {
  assertPersonalNumber(e164)
  return { phoneEncrypted: encryptJson(e164), phoneHash: await indexKeyFromE164(e164), phoneVerified: false }
}

export const hasPhone = (u: DocumentSnapshot): boolean => !!(u.get('phoneHash') || u.get('phoneNumber'))

/** The lookup key for this account's number, or null. */
export async function phoneHashOf(u: DocumentSnapshot): Promise<string | null> {
  const h = u.get('phoneHash')
  if (typeof h === 'string' && h) return h
  const legacy = u.get('phoneNumber')
  return typeof legacy === 'string' && legacy ? indexKeyFromE164(legacy) : null
}

/** The number in E.164. Only for the owner's own phone page and the admin phone-change flow. */
export function readPhone(u: DocumentSnapshot): string | null {
  const enc = u.get('phoneEncrypted')
  if (typeof enc === 'string' && enc) return decryptJson<string>(enc)
  const legacy = u.get('phoneNumber')
  return typeof legacy === 'string' && legacy ? legacy : null
}

/** Field values that take every phone field off a user doc (including the old plain one). */
export const phoneFieldsDeleted = (): Record<string, FieldValue> =>
  Object.fromEntries(PHONE_FIELDS.map(f => [f, FieldValue.delete()]))

/**
 * Gives up this account's claim on a number's lookup entry (only if it owns the entry) and hands it to another account that
 * has the same number, so contact matching keeps finding that person. Safe to call when nothing is owned.
 */
export async function releasePhoneIndex(db: Firestore, uid: string, hash: string): Promise<void> {
  const ref = db.collection('phoneIndex').doc(hash)
  const idx = await ref.get()
  if (!idx.exists || idx.get('uid') !== uid) return
  const others = await db.collection('users').where('phoneHash', '==', hash).limit(3).get()
  const next = others.docs.find(d => d.id !== uid)
  if (next) await ref.set({ uid: next.id, verified: false })
  else await ref.delete().catch(() => {})
}

/** How many OTHER accounts use the same number as this account. */
export async function otherPhoneUsers(db: Firestore, uid: string, hash: string | null): Promise<number> {
  if (!hash) return 0
  const snap = await db.collection('users').where('phoneHash', '==', hash).count().get()
  const total = snap.data().count
  const self = await db.collection('users').doc(uid).get()
  return Math.max(0, total - (self.get('phoneHash') === hash ? 1 : 0))
}

/**
 * Saves a number on an account and writes the three fields. A number another account already uses is allowed: the lookup
 * entry stays with the first account (the owner of a number is warned on their profile). `extra` is merged into the same update.
 */
export async function savePhone(db: Firestore, uid: string, e164: string, extra: Record<string, unknown> = {}): Promise<void> {
  const fields = await phoneFields(e164)
  const userRef = db.collection('users').doc(uid)
  const newRef = db.collection('phoneIndex').doc(fields.phoneHash)
  let oldHash: string | null = null
  await db.runTransaction(async tx => {
    const [u, hit] = await Promise.all([tx.get(userRef), tx.get(newRef)])
    if (!u.exists) throw new HttpError(404, 'No such account.')
    if (u.get('level') === 'guest') throw new HttpError(403, 'Phone number is for students.', 'BR-SET-002')
    oldHash = await phoneHashOf(u)
    if (!hit.exists) tx.set(newRef, { uid, verified: false })
    tx.update(userRef, { ...fields, phoneNumber: FieldValue.delete(), ...extra })
  })
  if (oldHash && oldHash !== fields.phoneHash) await releasePhoneIndex(db, uid, oldHash)
}

/** Takes the number off an account: deletes all three fields (and any old plain copy) and frees or hands off the lookup entry. */
export async function clearPhone(db: Firestore, uid: string, extra: Record<string, unknown> = {}): Promise<void> {
  const userRef = db.collection('users').doc(uid)
  const u = await userRef.get()
  if (!u.exists) throw new HttpError(404, 'No such account.')
  const hash = await phoneHashOf(u)
  await userRef.update({ ...phoneFieldsDeleted(), ...extra })
  if (hash) await releasePhoneIndex(db, uid, hash)
}
