import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { canEditAnyShow, hostContext, showOpen } from '@/lib/server/host'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { occIdOf } from '@/lib/server/live'

export const runtime = 'nodejs'

// Pin a message to a show while it airs: { occId, headline, message } (empty both = clear it).
// Hosts can do it for their own show (from 4 hours before to 4 hours after). Directors, admins and developers: any show.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const b = await readJson(req)
    const occId = str(b.occId, 160)
    const headline = str(b.headline, 80)
    const message = str(b.message, 400)
    if (!occId) throw new HttpError(400, 'Pick a show.')

    const c = await hostContext(req, db, now)
    const any = await canEditAnyShow(db, c.t)
    let expires = 0, title = ''
    const mine = c.shows.find(s => `${s.key.replace(':', '-')}_${s.startAt}` === occId)
    if (mine && (any || showOpen(mine, now))) { expires = mine.endAt + 10 * 60_000; title = mine.title }
    else if (any) {
      const item = (await buildScheduleFeed(db, { days: 7, showStudentHosts: false, now })).find(i => occIdOf(i) === occId)
      if (!item) throw new HttpError(404, 'That show is not on the schedule.')
      expires = item.endAt + 10 * 60_000; title = item.title
    } else {
      throw new HttpError(403, mine ? 'Your panel opens 4 hours before your show.' : "You aren't a host of that show.", 'BR-HST-002')
    }

    const ref = db.collection('liveNotes').doc(occId)
    if (!headline && !message) { await ref.delete(); return { ok: true, cleared: true } }
    const u = await db.collection('users').doc(c.t.uid).get()
    await ref.set({
      headline, message, showTitle: title, expiresAt: Timestamp.fromMillis(expires), updatedAt: Timestamp.now(),
      by: c.t.uid, byName: u.get('firstName') ?? u.get('displayName') ?? '',
    })
    return { ok: true }
  })
}
