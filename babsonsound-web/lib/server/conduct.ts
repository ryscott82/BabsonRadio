import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { HttpError } from './http'
import { accessOf } from './access'
import { CONDUCT_VERSION } from '../conduct'
import { autoEligible } from '../slotAuto'
import { looksLikeFullName } from '../publicContent'
import { splitName } from '../personName'
import { assertCleanName } from './wordFilter'

// Conduct agreement (everyone, once per version) and training status. Directors and admins skip the training gate.

export interface Signature { typedName: string; accepted: true; version: string }

/** Validate a typed signature. Throws a friendly error (no database access). */
export function checkSignature(input: unknown, version: string, code: string): Signature {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const typedName = String(o.typedName ?? '').trim().slice(0, 100)
  if (o.accepted !== true || o.version !== version || !looksLikeFullName(typedName)) {
    throw new HttpError(400, 'Tick every box and type your full name to sign.', code)
  }
  return { typedName, accepted: true, version }
}

async function saveRecord(db: Firestore, t: DecodedIdToken, kind: 'conduct', sig: Signature, scope: { kind: string; id: string }): Promise<string> {
  const ref = await db.collection('conductConsents').add({
    uid: t.uid, email: t.email ?? '', typedName: sig.typedName, kind, version: sig.version,
    scopeKind: scope.kind, scopeId: scope.id, signedAt: Timestamp.now(),
  })
  return ref.id
}

/** The name typed to sign becomes the account name when the account has none yet, so signing up from the training page never asks for it. */
export async function saveSignedName(db: Firestore, t: DecodedIdToken, typedName: string): Promise<void> {
  const ref = db.collection('users').doc(t.uid)
  const u = await ref.get()
  if (String(u.get('firstName') ?? '').trim()) return
  const { firstName, lastName } = splitName(typedName, String(u.get('email') ?? t.email ?? ''))
  if (!firstName) return
  try { await assertCleanName(db, firstName.slice(0, 40), lastName.slice(0, 60)) } catch { return } // not allowed: the name step asks instead
  await ref.set({ firstName: firstName.slice(0, 40), displayName: firstName.slice(0, 40), ...(lastName ? { lastName: lastName.slice(0, 60) } : {}) }, { merge: true })
}

/** Sign the conduct agreement; remembered on the profile so it is asked once per version. */
export async function signConduct(db: Firestore, t: DecodedIdToken, input: unknown): Promise<string> {
  const sig = checkSignature(input, CONDUCT_VERSION, 'BR-CON-001')
  const id = await saveRecord(db, t, 'conduct', sig, { kind: 'user', id: t.uid })
  await db.collection('users').doc(t.uid).set({ conductVersion: CONDUCT_VERSION, conductSignedAt: Timestamp.now(), conductConsentId: id }, { merge: true })
  await saveSignedName(db, t, sig.typedName)
  return id
}

/** Their pending show requests were made before they signed or trained: update what the auto-approver looks at, and drop the training deadline once trained. */
export async function markPendingReady(db: Firestore, uid: string, radioTrained: boolean): Promise<void> {
  const [u, pending] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('slotRequests').where('requesterUid', '==', uid).where('status', '==', 'pending').get(),
  ])
  const signed = u.get('conductVersion') === CONDUCT_VERSION
  await Promise.all(pending.docs.map(d => d.ref.update({
    conductSigned: signed, autoEligible: autoEligible({ type: String(d.get('type')), radioTrained }),
    autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete(),
    ...(radioTrained ? { trainByAt: FieldValue.delete() } : {}),
  })))
}

export async function isStaff(_db: Firestore, t: DecodedIdToken): Promise<boolean> {
  const l = (await accessOf(t)).level
  return l === 'director' || l === 'admin'
}

/** How long an admin's "yes, they are at training" stays valid for taking the quiz. */
export const CHECKIN_VALID_MS = 12 * 3_600_000

export type CheckIn = 'none' | 'pending' | 'approved'
export interface Readiness { conductSigned: boolean; trained: boolean; trainingRequested: boolean; staff: boolean; checkIn: CheckIn; quizUnlocked: boolean }

const ms = (v: unknown) => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0

export async function readiness(db: Firestore, t: DecodedIdToken): Promise<Readiness> {
  const [u, tr, staff] = await Promise.all([
    db.collection('users').doc(t.uid).get(),
    db.collection('training').doc(t.uid).get(),
    isStaff(db, t),
  ])
  const trained = (await accessOf(t)).radio // the radioTrained badge (directors and admins count as trained)
  const at = ms(tr.get('checkInAt')), ok = ms(tr.get('checkInApprovedAt')), now = Date.now()
  const approved = ok > 0 && ok >= at && now - ok < CHECKIN_VALID_MS
  const checkIn: CheckIn = approved ? 'approved' : at > 0 && ok < at && now - at < CHECKIN_VALID_MS ? 'pending' : 'none'
  return {
    conductSigned: u.get('conductVersion') === CONDUCT_VERSION,
    trained,
    trainingRequested: tr.exists && tr.get('requestedAt') != null && tr.get('certifiedAt') == null,
    staff,
    checkIn,
    quizUnlocked: staff || approved,
  }
}
