import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// Staff fix the schedule by hand: "this playlist really played from X to Y" (or is still playing).
// It is stored like the automatic corrections (see lib/server/actualPlaylist.ts), replaces anything it overlaps,
// and if the playlist is still playing the automatic tracking keeps extending it.
// { label, startAt, endAt?, ongoing? }
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const label = str(b.label, 80)
    const startAt = Number(b.startAt)
    const now = Date.now()
    const ongoing = b.ongoing === true
    const endAt = ongoing ? now + 15 * 60_000 : Number(b.endAt)
    if (!label) throw new HttpError(400, 'Type the playlist name.')
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) throw new HttpError(400, 'The end has to be after the start.')
    if (startAt > now + 3600_000) throw new HttpError(400, 'The start can not be in the future.')

    const db = adminDb()
    const snap = await db.collection('autoActual').where('endAt', '>', Timestamp.fromMillis(startAt)).get()
    const batch = db.batch()
    for (const d of snap.docs) {
      const s = (d.get('startAt') as Timestamp).toMillis(), e = (d.get('endAt') as Timestamp).toMillis()
      if (s >= endAt) continue
      if (s >= startAt && e <= endAt) { batch.delete(d.ref); continue }       // swallowed
      if (s < startAt) {
        batch.update(d.ref, { endAt: Timestamp.fromMillis(startAt) })          // cut its end
        if (e > endAt) batch.set(db.collection('autoActual').doc(String(endAt)), { ...d.data(), startAt: Timestamp.fromMillis(endAt) }) // split
      } else batch.delete(d.ref).set(db.collection('autoActual').doc(String(endAt)), { ...d.data(), startAt: Timestamp.fromMillis(endAt) }) // cut its start
    }
    batch.set(db.collection('autoActual').doc(String(startAt)), {
      startAt: Timestamp.fromMillis(startAt), endAt: Timestamp.fromMillis(endAt),
      label, playlist: label, planned: '', manual: true, createdAt: Timestamp.fromMillis(now),
    })
    await batch.commit()
    return { ok: true }
  })
}
