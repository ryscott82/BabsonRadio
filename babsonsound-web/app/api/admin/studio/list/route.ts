import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { guestCsv, type ListRow } from '@/lib/studioList'
import { rowOf } from '@/lib/server/studioBook'
import type { Guest } from '@/lib/studioBookCore'

export const runtime = 'nodejs'

async function load(req: Request): Promise<ListRow[]> {
  await requireDirector(req)
  const db = adminDb()
  const from = Timestamp.fromMillis(Date.now() - 3 * 3_600_000)
  const [bk, rq] = await Promise.all([
    db.collection('studioBookings').where('startAt', '>=', from).orderBy('startAt').limit(300).get(),
    db.collection('slotRequests').where('startAt', '>=', from).orderBy('startAt').limit(300).get(),
  ])
  return [
    ...bk.docs.filter(d => d.get('status') === 'booked' || d.get('status') === 'checked-in').map(d => {
      const b = rowOf(d)
      return { kind: 'studio' as const, startAt: b.startAt, endAt: b.endAt, hostName: b.name, hostEmail: String(d.get('email') ?? ''), title: 'Studio booking', status: b.status, guests: b.guests, justMe: b.justMe }
    }),
    ...rq.docs.filter(d => d.get('status') === 'pending' || d.get('status') === 'approved').map(d => ({
      kind: (d.get('type') === 'live' ? 'live' : 'prerecorded') as 'live' | 'prerecorded', startAt: d.get('startAt').toMillis() as number, endAt: d.get('endAt').toMillis() as number,
      hostName: String(d.get('requesterName') ?? ''), hostEmail: String(d.get('requesterEmail') ?? ''), title: String(d.get('title') ?? ''), status: String(d.get('status')),
      guests: ((d.get('guests') as Guest[] | undefined) ?? []).map(g => ({ name: g.name, email: g.email })), justMe: d.get('justMe') === true,
    })),
  ].sort((a, b) => a.startAt - b.startAt)
}

// E-board and Admin: upcoming studio bookings and upcoming show requests (pending or approved) with who is coming (names and emails). The only place guest
// lists are readable by anyone but the person who made them. Add ?format=csv for a spreadsheet (one row per guest). Not polled.
export async function GET(req: Request) {
  const res = await handle(async () => ({ rows: await load(req) }), { 'Cache-Control': 'private, no-store' })
  if (new URL(req.url).searchParams.get('format') !== 'csv' || !res.ok) return res
  const { rows } = (await res.json()) as { rows: ListRow[] }
  return new Response(guestCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="guest-list.csv"', 'Cache-Control': 'private, no-store' } })
}
