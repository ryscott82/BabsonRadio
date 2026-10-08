import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'

// "Saved by N Babson Radio members": how many members have a given phone number in their contacts.
// Only scrambled numbers are kept (an HMAC with a server secret, never names), and only the count ever leaves
// the server, never who saved whom. A number is suggested only when at least 1 other member saved it.
//
// Cost design: a sync is ONE write (the member's own list). The counts are rebuilt at most once a day by
// reading each member's list once and writing only the popular numbers into 16 small shard documents.
// Looking numbers up is at most 16 reads. So the cost scales with members, not with contacts.

export const MIN_OTHERS = 1
export const MAX_KEYS = 3000
export const REBUILD_MS = 24 * 3600_000
const SHARDS = '0123456789abcdef'.split('')
const shardRef = (db: Firestore, ch: string) => db.collection('contactPopularity').doc('s' + ch)
const metaRef = (db: Firestore) => db.collection('config').doc('contactPopular')

/** Store this member's list. Writes nothing if it has not changed. */
export async function setContactGraph(db: Firestore, uid: string, next: string[]): Promise<void> {
  const ref = db.collection('contactGraph').doc(uid)
  if (!next.length) { await ref.delete(); return }
  const want = [...new Set(next)].slice(0, MAX_KEYS).sort()
  const prev = ((await ref.get()).get('keys') as string[] | undefined) ?? []
  if (prev.length === want.length && prev.every((k, i) => k === want[i])) return
  await ref.set({ keys: want, updatedAt: Timestamp.now() })
}

/** Take this member's numbers out (turning it off, or deleting the account). */
export const removeContactGraph = (db: Firestore, uid: string) => setContactGraph(db, uid, [])

/** Rebuild the shard documents if they are older than a day. Safe to call often; one caller wins the lock. */
export async function rebuildIfStale(db: Firestore): Promise<void> {
  const now = Date.now()
  const claimed = await db.runTransaction(async tx => {
    const m = await tx.get(metaRef(db))
    const builtAt = (m.get('builtAt') as Timestamp | undefined)?.toMillis() ?? 0
    const lockUntil = (m.get('lockUntil') as Timestamp | undefined)?.toMillis() ?? 0
    if (now - builtAt < REBUILD_MS || lockUntil > now) return false
    tx.set(metaRef(db), { lockUntil: Timestamp.fromMillis(now + 10 * 60_000) }, { merge: true })
    return true
  })
  if (!claimed) return

  const counts = new Map<string, number>()
  for await (const doc of db.collection('contactGraph').select('keys').stream() as AsyncIterable<FirebaseFirestore.QueryDocumentSnapshot>) {
    for (const k of (doc.get('keys') as string[] | undefined) ?? []) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const shards: Record<string, Record<string, number>> = Object.fromEntries(SHARDS.map(c => [c, {}]))
  for (const [k, n] of counts) if (n > MIN_OTHERS) shards[k[0]][k] = n // only numbers that could ever be shown
  const batch = db.batch()
  for (const c of SHARDS) batch.set(shardRef(db, c), { counts: shards[c] }) // replace, so old numbers drop out
  batch.set(metaRef(db), { builtAt: Timestamp.now(), lockUntil: Timestamp.fromMillis(0) }, { merge: true })
  await batch.commit()
}

/** How many members have each key saved, as of the last daily rebuild (only numbers saved by 2+ members appear). */
export async function popularity(db: Firestore, keys: string[]): Promise<Map<string, number>> {
  const need = [...new Set(keys.map(k => k[0]))]
  const snaps = await db.getAll(...need.map(c => shardRef(db, c)))
  const out = new Map<string, number>()
  for (const s of snaps) {
    const c = (s.get('counts') as Record<string, number> | undefined) ?? {}
    for (const k of keys) if (k[0] === s.id.slice(1) && c[k]) out.set(k, c[k])
  }
  return out
}
