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
 * Saves a number on an account: claims the unique lookup entry (409 if another account has it), frees this account's old
 * entry, writes the three fields. `extra` is merged into the same user update.
 */
export async function savePhone(db: Firestore, uid: string, e164: string, extra: Record<string, unknown> = {}): Promise<void> {
  const fields = await phoneFields(e164)
  const userRef = db.collection('users').doc(uid)
  const newRef = db.collection('phoneIndex').doc(fields.phoneHash)
  await db.runTransaction(async tx => {
    const [u, hit] = await Promise.all([tx.get(userRef), tx.get(newRef)])
    if (!u.exists) throw new HttpError(404, 'No such account.')
    if (u.get('level') === 'guest') throw new HttpError(403, 'Phone number is for students.', 'BR-SET-002')
    if (hit.exists && hit.get('uid') !== uid) throw new HttpError(409, 'That phone number is already registered.', 'BR-ACC-003')
    const oldHash = await phoneHashOf(u)
    if (oldHash && oldHash !== fields.phoneHash) tx.delete(db.collection('phoneIndex').doc(oldHash))
    tx.set(newRef, { uid, verified: false })
    tx.update(userRef, { ...fields, phoneNumber: FieldValue.delete(), ...extra })
  })
}

/** Takes the number off an account: frees the lookup entry and deletes all three fields (and any old plain copy). */
export async function clearPhone(db: Firestore, uid: string, extra: Record<string, unknown> = {}): Promise<void> {
  const userRef = db.collection('users').doc(uid)
  const u = await userRef.get()
  if (!u.exists) throw new HttpError(404, 'No such account.')
  const hash = await phoneHashOf(u)
  if (hash) await db.collection('phoneIndex').doc(hash).delete().catch(() => {})
  await userRef.update({ ...phoneFieldsDeleted(), ...extra })
}
