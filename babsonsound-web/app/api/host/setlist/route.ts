import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { hostContext, occurrenceId, showOpen } from '@/lib/server/host'

export const runtime = 'nodejs'

// The songs played on a show, typed or pasted by the host. One document per airing (show + start time).
// Hosts can edit while the show's 4-hour window is open; staff can edit any time.

async function findShow(req: Request, key: string, startAt: number) {
  const db = adminDb()
  const c = await hostContext(req, db)
  const show = c.shows.find(s => s.key === key && s.startAt === startAt)
  if (!show && !c.staff) throw new HttpError(403, "You aren't a host of that show.", 'BR-HST-002')
  return { db, c, show }
}

export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url)
    const key = str(u.searchParams.get('key'), 120), startAt = Number(u.searchParams.get('startAt'))
    if (!key || !Number.isFinite(startAt)) throw new HttpError(400, 'Invalid request.')
    const { db } = await findShow(req, key, startAt)
    const d = await db.collection('setlists').doc(occurrenceId({ key, startAt })).get()
    return { songs: d.get('songs') ?? '', updatedAt: d.exists ? (d.get('updatedAt') as Timestamp).toMillis() : null }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const key = str(b.key, 120), startAt = Number(b.startAt)
    const songs = typeof b.songs === 'string' ? b.songs.replace(/\r\n/g, '\n').slice(0, 10_000) : ''
    if (!key || !Number.isFinite(startAt)) throw new HttpError(400, 'Invalid request.')
    const { db, c, show } = await findShow(req, key, startAt)
    if (!c.staff && show && !showOpen(show, Date.now())) {
      throw new HttpError(403, 'The set list is open from 4 hours before your show until 4 hours after.', 'BR-HST-001')
    }
    const lines = songs.split('\n').map(l => l.trim()).filter(Boolean)
    await db.collection('setlists').doc(occurrenceId({ key, startAt })).set({
      key, startAt: Timestamp.fromMillis(startAt),
      endAt: show ? Timestamp.fromMillis(show.endAt) : null,
      showTitle: show?.title ?? '', songs, songCount: lines.length,
      updatedBy: c.t.uid, updatedAt: Timestamp.now(),
    }, { merge: true })
    return { ok: true, songCount: lines.length, savedAt: Date.now() }
  })
}
