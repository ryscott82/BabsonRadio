import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { TERMS_VERSION } from '../terms'
import { BABSON_EMAIL } from './http'

/**
 * A guest who is really a student: once their sign-in email has become a verified school address
 * (they confirmed it from the link Firebase sent), turn the guest profile into a student one.
 * The name and graduation year were saved when they started (users/{uid}.pendingSchool).
 * Returns true when the upgrade happened on this call.
 */
export async function finishSchoolUpgrade(db: Firestore, t: DecodedIdToken): Promise<boolean> {
  const email = (t.email ?? '').toLowerCase()
  if (!BABSON_EMAIL.test(email) || t.email_verified !== true) return false
  const ref = db.collection('users').doc(t.uid)
  const snap = await ref.get()
  if (!snap.exists || snap.get('role') !== 'guest') return false
  const p = (snap.get('pendingSchool') ?? {}) as { email?: string; firstName?: string; lastName?: string; gradYear?: string }
  const at = email.indexOf('@')
  const domainName = email.slice(at + 1, email.indexOf('.', at))
  const username = domainName === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${domainName}`
  await ref.update({
    email, username,
    firstName: p.firstName || snap.get('firstName') || 'Student',
    lastName: p.lastName || '',
    displayName: p.firstName || snap.get('displayName') || 'Student',
    gradYear: p.gradYear || '',
    role: 'listener', accountType: 'babson',
    termsAcceptedAt: snap.get('termsAcceptedAt') ?? Timestamp.now(), termsVersion: snap.get('termsVersion') ?? TERMS_VERSION,
    upgradedFromGuestAt: Timestamp.now(),
    pendingSchool: FieldValue.delete(),
  })
  // Their old guest paperwork no longer matters.
  await Promise.all([
    db.collection('guestPasses').doc(t.uid).delete(),
    db.collection('guestLinks').doc(t.uid).delete(),
  ]).catch(() => {})
  return true
}
