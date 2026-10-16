import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { HttpError } from './http'
import { PUBLIC_AGREEMENT_VERSION, looksLikeFullName, type AdultStatus } from '../publicContent'

// Public content is opt-in, adults only, and needs a typed signature. Everything else stays students-only.

/** 'adult' only when the profile positively says 18+ (birthday or age range). Missing = unknown = not allowed. */
export async function adultStatus(db: Firestore, uid: string): Promise<AdultStatus> {
  const u = await db.collection('users').doc(uid).get()
  if (u.get('minor') === true) return 'minor'
  if (u.get('minor') === false && u.get('onboardedAt')) return 'adult'
  return 'unknown'
}

/** Every person must be a known adult. One minor, or one unknown, blocks it for the whole piece. */
export async function assertAllAdults(db: Firestore, uids: string[]): Promise<void> {
  if (!uids.length) throw new HttpError(403, 'Add the host first. Public sharing needs a known adult host.', 'BR-PUB-003')
  for (const uid of uids) {
    const s = await adultStatus(db, uid)
    if (s === 'minor') throw new HttpError(403, 'Content with anyone under 18 cannot be made public.', 'BR-PUB-001')
    if (s === 'unknown') throw new HttpError(403, "Every host needs their birthday or age range on file (and to be 18 or older) before this can be public.", 'BR-PUB-002')
  }
}

export interface ConsentInput { typedName: unknown; accepted: unknown; version: unknown }

/** Check the signature and keep a record of it. Returns the record id. */
export async function recordConsent(
  db: Firestore, t: DecodedIdToken, input: ConsentInput, scope: { kind: 'slot' | 'episode'; id: string; title: string },
): Promise<string> {
  const typedName = String(input.typedName ?? '').trim().slice(0, 100)
  if (input.accepted !== true || input.version !== PUBLIC_AGREEMENT_VERSION || !looksLikeFullName(typedName)) {
    throw new HttpError(400, 'Tick every box and type your full name to sign.', 'BR-PUB-004')
  }
  const ref = await db.collection('publicConsents').add({
    uid: t.uid, email: t.email ?? '', typedName, version: PUBLIC_AGREEMENT_VERSION,
    scopeKind: scope.kind, scopeId: scope.id, title: scope.title.slice(0, 140),
    signedAt: Timestamp.now(), revokedAt: null,
  })
  return ref.id
}

export async function revokeConsent(db: Firestore, id: string | undefined): Promise<void> {
  if (id) await db.collection('publicConsents').doc(id).update({ revokedAt: Timestamp.now() }).catch(() => {})
}

/** Is this consent record real, signed by one of these hosts and not revoked? */
export async function consentValid(db: Firestore, id: string | undefined, hostUids: string[]): Promise<boolean> {
  if (!id) return false
  const d = await db.collection('publicConsents').doc(id).get()
  return d.exists && d.get('revokedAt') == null && hostUids.includes(String(d.get('uid')))
}
