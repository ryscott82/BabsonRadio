import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector, str } from '@/lib/server/http'
import { assertClean } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

// Club events (collection clubEvents): { title, startAt, endAt, place, details }.
//   GET     public, upcoming events soonest first (up to 50). Kept 5 minutes on the server and the edge. { events: [{ id, title, startAt, endAt, place, details }] }
//   POST    E-board and Admin: add one ({ title, startAt (ms), endAt (ms), place?, details? }), or change one with { id, ... }. -> { id }
//   DELETE  E-board and Admin: ?id=<event id>. -> { ok }
let cache: { at: number; events: unknown[] } | null = null
const TTL = 5 * 60_000

export async function GET() {
  return handle(async () => {
    const now = Date.now()
    if (cache && now - cache.at < TTL) return { events: cache.events }
    const snap = await adminDb().collection('clubEvents').where('endAt', '>=', Timestamp.fromMillis(now)).orderBy('endAt').limit(50).get()
    const events = snap.docs.map(d => ({
      id: d.id, title: String(d.get('title') ?? ''), startAt: (d.get('startAt') as Timestamp).toMillis(), endAt: (d.get('endAt') as Timestamp).toMillis(),
      place: String(d.get('place') ?? ''), details: String(d.get('details') ?? ''),
    })).sort((a, b) => a.startAt - b.startAt)
    cache = { at: now, events }
    return { events }
  }, { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const title = str(b.title, 100), place = str(b.place, 120), details = str(b.details, 1000)
    const startAt = Number(b.startAt), endAt = Number(b.endAt)
    if (!title || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) throw new HttpError(400, 'Add a title and a start time, with the end after the start.', 'BR-EVT-001')
    const db = adminDb()
    await assertClean(db, title, place, details)
    const data = { title, place, details, startAt: Timestamp.fromMillis(startAt), endAt: Timestamp.fromMillis(endAt) }
    const id = str(b.id, 100)
    let ref
    if (id) {
      ref = db.collection('clubEvents').doc(id)
      if (!(await ref.get()).exists) throw new HttpError(404, 'Event not found.')
      await ref.update({ ...data, updatedBy: t.uid, updatedAt: Timestamp.now() })
    } else {
      ref = await db.collection('clubEvents').add({ ...data, createdBy: t.uid, createdAt: Timestamp.now() })
    }
    cache = null
    return { id: ref.id }
  })
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const id = str(new URL(req.url).searchParams.get('id'), 100)
    if (!id) throw new HttpError(400, 'Pick an event to delete.')
    await adminDb().collection('clubEvents').doc(id).delete()
    cache = null
    return { ok: true }
  })
}
