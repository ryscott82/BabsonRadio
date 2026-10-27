import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { clearPhone, savePhone } from './phoneStore'

/** Moves an account to a new number (E.164): claims the new lookup entry, frees the old one, writes the three phone fields. */
export async function applyPhone(db: Firestore, uid: string, phone: string): Promise<void> {
  await savePhone(db, uid, phone, { phoneChangedAt: Timestamp.now() })
}

export const last4 = (p: unknown) => (typeof p === 'string' && p.length >= 4 ? p.slice(-4) : '')

/**
 * Takes the number off an account: frees the lookup entry, clears the profile field and drops any pending change request.
 * The setup prompt is pushed back a week (as if skipped 3 times), so removing it on purpose does not bring the question straight back.
 */
export async function removePhone(db: Firestore, uid: string): Promise<void> {
  const now = Date.now()
  await clearPhone(db, uid, {
    phoneChangedAt: Timestamp.now(),
    'setup.skips.phone.count': 3, 'setup.skips.phone.lastSkippedAt': now,
  })
  await db.collection('phoneChanges').doc(uid).delete().catch(() => {})
}
