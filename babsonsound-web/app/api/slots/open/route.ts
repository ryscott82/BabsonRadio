import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireMember } from '@/lib/server/http'
import { SLOT_RULES } from '@/lib/slots'
import { openWindow, toOpenRanges, type OpenRange } from '@/lib/slotAuto'

export const runtime = 'nodejs'

// Times that are taken, for greying out the time picker: booked shows (airSlots) and pending requests, from `from` to `to` (ms; at most 14 days,
// from defaults to now). Times only: no names, titles or ids. The answer is the same for everyone (a person's own pending request is included, they
// read their own in /api/slots/mine), so it can be shared: this server keeps each window for 60 s, and the reply is marked public, s-maxage=60 with
// stale-while-revalidate. Vercel's edge does not cache requests that carry a sign-in header, so the 60 s memory copy is what saves the database reads.
// Not polled.
const cache = new Map<string, { at: number; ranges: OpenRange[] }>()
const TTL = 60_000

export async function GET(req: Request) {
  return handle(async () => {
    await requireMember(req)
    const now = Date.now()
    const q = new URL(req.url).searchParams
    const w = openWindow(q.get('from'), q.get('to'), now)
    if (!w) throw new HttpError(400, 'Give a start and an end time (ms), with the end after the start.')
    // Same window within a minute: the same answer (the key is rounded to the minute, so a crowd opening the picker shares one read).
    const key = `${Math.floor(w.from / 60_000)}-${Math.floor(w.to / 60_000)}`
    const hit = cache.get(key)
    if (hit && now - hit.at < TTL) return { from: w.from, to: w.to, ranges: hit.ranges }

    const db = adminDb()
    const lookBack = w.from - SLOT_RULES.maxMinutes * 60_000
    const [slots, pending] = await Promise.all([
      db.collection('airSlots').where('startAt', '>=', Timestamp.fromMillis(lookBack)).where('startAt', '<', Timestamp.fromMillis(w.to)).get(),
      db.collection('slotRequests').where('status', '==', 'pending').get(),
    ])
    const span = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({ startAt: d.get('startAt').toMillis() as number, endAt: d.get('endAt').toMillis() as number })
    const ranges = toOpenRanges(slots.docs.map(span), pending.docs.map(span), w.from, w.to)
    if (cache.size > 40) cache.clear()
    cache.set(key, { at: now, ranges })
    return { from: w.from, to: w.to, ranges }
  }, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' })
}
