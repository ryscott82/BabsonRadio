import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { indexKeyFromE164 } from './phone'

/** Moves an account to a new number (E.164): claims the new lookup entry, frees the old one, updates the profile. */
export async function applyPhone(db: Firestore, uid: string, phone: string): Promise<void> {
  const userRef = db.collection('users').doc(uid)
  const u = await userRef.get()
  if (!u.exists) throw new HttpError(404, 'No such account.')
  const old = u.get('phoneNumber') as string | undefined
  if (old === phone) return
  const newRef = db.collection('phoneIndex').doc(await indexKeyFromE164(phone))
  await db.runTransaction(async tx => {
    const hit = await tx.get(newRef)
    if (hit.exists && hit.get('uid') !== uid) throw new HttpError(409, 'That phone number is already registered to another account.')
    tx.set(newRef, { uid })
  })
  if (old) await db.collection('phoneIndex').doc(await indexKeyFromE164(old)).delete().catch(() => {})
  await userRef.update({ phoneNumber: phone, phoneChangedAt: Timestamp.now() })
}

export const last4 = (p: unknown) => (typeof p === 'string' && p.length >= 4 ? p.slice(-4) : '')
