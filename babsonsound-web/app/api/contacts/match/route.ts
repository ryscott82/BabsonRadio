import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireBabson } from '@/lib/server/http'
import { indexKeyFromHash } from '@/lib/server/phone'

export const runtime = 'nodejs'

const MAX_HASHES = 5000
const MAX_SYNCS_PER_DAY = 5

// Body: { hashes: string[] } — hex SHA-256 of each contact's E.164 number (see lib/phone.ts).
// Only hashes that match registered Babson members create connections; nothing else is stored.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireBabson(req)
    const { hashes } = await readJson(req)
    if (!Array.isArray(hashes) || hashes.length === 0 || hashes.length > MAX_HASHES) {
      throw new HttpError(400, `Send between 1 and ${MAX_HASHES} hashes.`)
    }
    const unique = [...new Set(hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h)))]
    if (!unique.length) throw new HttpError(400, 'No valid hashes.')

    const db = adminDb()

    // Rate limit: each sync lets the caller test thousands of numbers against the user base.
    const day = new Date().toISOString().slice(0, 10)
    const limitRef = db.collection('contactSyncs').doc(t.uid)
    await db.runTransaction(async tx => {
      const s = await tx.get(limitRef)
      const count = s.get('day') === day ? (s.get('count') as number) : 0
      if (count >= MAX_SYNCS_PER_DAY) throw new HttpError(429, 'Contact sync limit reached for today.')
      tx.set(limitRef, { day, count: count + 1 })
    })

    const refs = unique.map(h => db.collection('phoneIndex').doc(indexKeyFromHash(h)))
    const matchedUids = new Set<string>()
    for (let i = 0; i < refs.length; i += 300) {
      for (const snap of await db.getAll(...refs.slice(i, i + 300))) {
        const uid = snap.get('uid')
        if (snap.exists && uid && uid !== t.uid) matchedUids.add(uid)
      }
    }

    const people: { uid: string; firstName: string; mutual: boolean }[] = []
    for (const uid of matchedUids) {
      const [u, reverse] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('users').doc(uid).collection('connections').doc(t.uid).get(),
      ])
      if (!u.exists) continue
      const mutual = reverse.exists
      const batch = db.batch()
      batch.set(db.collection('users').doc(t.uid).collection('connections').doc(uid),
        { source: 'contacts', mutual, createdAt: Timestamp.now() }, { merge: true })
      if (mutual) {
        batch.update(db.collection('users').doc(uid).collection('connections').doc(t.uid), { mutual: true })
      }
      await batch.commit()
      people.push({ uid, firstName: u.get('firstName') ?? 'Student', mutual })
    }

    await db.collection('users').doc(t.uid).update({
      contactsSyncedAt: FieldValue.serverTimestamp(), lastSyncMatches: matchedUids.size,
    })
    return { matched: people.length, people }
  })
}
