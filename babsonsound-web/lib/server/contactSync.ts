import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { seenIdOfHash } from './phone'
import { chargeSync, gapOk, parseSeen, serializeSeen } from '../contactLimits'

// contactSyncs/{uid} is one doc per member:
//   matchAt / popularAt   when each route last ran (one full sync a day each)
//   seen                  8-byte tags of every number sent in the last 30 days (see lib/contactLimits.ts)
//   flagged, flagReason…  set when a sync looked like a scrape; syncing stays paused until an admin clears it
// One sync = one read + one write here.

export type SyncRoute = 'match' | 'popular'

/** Checks the pause flag and the daily limit, charges the new numbers against the 30-day cap, and returns the numbers that may be looked up. */
export async function beginSync(db: Firestore, uid: string, route: SyncRoute, hashes: string[], now = Date.now()) {
  const ref = db.collection('contactSyncs').doc(uid)
  return db.runTransaction(async tx => {
    const s = await tx.get(ref)
    if (s.get('flagged') === true) {
      throw new HttpError(403, 'Contacts are paused on your account. Contact Babson Radio if this is a mistake.', 'BR-CON-007')
    }
    const key = route === 'match' ? 'matchAt' : 'popularAt'
    if (!gapOk(Number(s.get(key) ?? 0), now)) {
      throw new HttpError(429, 'You already synced your contacts today. Try again tomorrow.', route === 'match' ? 'BR-CON-005' : 'BR-CON-003')
    }
    const tag = new Map(hashes.map(h => [h, seenIdOfHash(h)]))
    const r = chargeSync(parseSeen(s.get('seen')), [...tag.values()], now)
    tx.set(ref, { [key]: now, seen: serializeSeen(r.seen) }, { merge: true })
    return { hashes: hashes.filter(h => r.accepted.has(tag.get(h)!)), capped: r.capped }
  })
}

/** Pauses an account's syncing and leaves a note for the Admin Panel (it shows up under Notifications and on the Phone lookup page). */
export async function flagSync(db: Firestore, uid: string, reason: string, who: { email: string; name: string }) {
  await db.collection('contactSyncs').doc(uid).set({
    flagged: true, flagReason: reason, flagAt: Timestamp.now(), flagEmail: who.email, flagName: who.name,
  }, { merge: true })
}
