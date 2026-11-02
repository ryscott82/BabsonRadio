import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { canEditAnyShow, hostContext, showOpen } from '@/lib/server/host'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { forgetRequestsDoc, occIdOf } from '@/lib/server/live'

export const runtime = 'nodejs'

// A DJ turns song requests on or off for their own show: { occId, open }. Directors, admins and developers: any show.
// Requests are never open for the auto DJ, and switch themselves off when the show ends.
export async function POST(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const b = await readJson(req)
    const occId = str(b.occId, 160)
    if (!occId) throw new HttpError(400, 'Pick a show.')

    const c = await hostContext(req, db, now)
    const any = await canEditAnyShow(db, c.t)
    let endAt = 0, title = ''
    const mine = c.shows.find(s => `${s.key.replace(':', '-')}_${s.startAt}` === occId)
    if (mine && (any || showOpen(mine, now))) { endAt = mine.endAt; title = mine.title }
    else if (any) {
      const item = (await buildScheduleFeed(db, { days: 7, showStudentHosts: false, now })).find(i => occIdOf(i) === occId && i.source !== 'auto')
      if (!item) throw new HttpError(404, 'That show is not on the schedule.')
      endAt = item.endAt; title = item.title
    } else {
      throw new HttpError(403, mine ? 'Your panel opens 4 hours before your show.' : "You aren't a host of that show.", 'BR-HST-002')
    }

    const open = b.open === true
    await db.collection('liveRequests').doc(occId).set({
      open, showTitle: title, expiresAt: Timestamp.fromMillis(endAt), updatedAt: Timestamp.now(), by: c.t.uid,
    })
    forgetRequestsDoc(occId)
    return { ok: true, open }
  })
}
