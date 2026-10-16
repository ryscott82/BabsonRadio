import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { HttpError, isDeveloperToken } from './http'
import { CLEAN_VERSION, CONDUCT_VERSION } from '../conduct'
import { looksLikeFullName } from '../publicContent'

// Conduct agreement (everyone, once per version) and training status. Staff (director, admin, developer) skip the training gate.

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

async function saveRecord(db: Firestore, t: DecodedIdToken, kind: 'conduct' | 'clean', sig: Signature, scope: { kind: string; id: string }): Promise<string> {
  const ref = await db.collection('conductConsents').add({
    uid: t.uid, email: t.email ?? '', typedName: sig.typedName, kind, version: sig.version,
    scopeKind: scope.kind, scopeId: scope.id, signedAt: Timestamp.now(),
  })
  return ref.id
}

/** Sign the conduct agreement; remembered on the profile so it is asked once per version. */
export async function signConduct(db: Firestore, t: DecodedIdToken, input: unknown): Promise<string> {
  const sig = checkSignature(input, CONDUCT_VERSION, 'BR-CON-001')
  const id = await saveRecord(db, t, 'conduct', sig, { kind: 'user', id: t.uid })
  await db.collection('users').doc(t.uid).set({ conductVersion: CONDUCT_VERSION, conductSignedAt: Timestamp.now(), conductConsentId: id }, { merge: true })
  return id
}

/** Sign the clean-hours pledge for one request. */
export async function signCleanPledge(db: Firestore, t: DecodedIdToken, input: unknown, requestId: string): Promise<string> {
  const sig = checkSignature(input, CLEAN_VERSION, 'BR-CON-002')
  return saveRecord(db, t, 'clean', sig, { kind: 'slot', id: requestId })
}

export async function isStaff(db: Firestore, t: DecodedIdToken): Promise<boolean> {
  if (isDeveloperToken(t)) return true
  const role = (await db.collection('users').doc(t.uid).get()).get('role')
  return role === 'director' || role === 'superAdmin'
}

export interface Readiness { conductSigned: boolean; trained: boolean; trainingRequested: boolean; staff: boolean }

export async function readiness(db: Firestore, t: DecodedIdToken): Promise<Readiness> {
  const [u, tr, staff] = await Promise.all([
    db.collection('users').doc(t.uid).get(),
    db.collection('training').doc(t.uid).get(),
    isStaff(db, t),
  ])
  const trained = staff || (tr.exists && tr.get('certifiedAt') != null && tr.get('revokedAt') == null)
  return {
    conductSigned: u.get('conductVersion') === CONDUCT_VERSION,
    trained,
    trainingRequested: tr.exists && tr.get('requestedAt') != null && tr.get('certifiedAt') == null,
    staff,
  }
}
