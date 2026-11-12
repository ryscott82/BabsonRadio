import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireMember } from '@/lib/server/http'
import { openGrid } from '@/lib/server/studioBook'
import { openWindow } from '@/lib/slotAuto'

export const runtime = 'nodejs'

// Booked studio times for the booking grid: bookings, live shows that hold the studio and pending live requests, from `from` to `to` (ms; at most 14 days,
// from defaults to now). Times only: no names. The same answer for everyone, kept 60 s on the server. Also the quiet-hours stretches, the quiet warning
// sentence and the rules the grid needs. Not polled. Any signed-in member can read it.
export async function GET(req: Request) {
  return handle(async () => {
    await requireMember(req)
    const q = new URL(req.url).searchParams
    const w = openWindow(q.get('from'), q.get('to'), Date.now())
    if (!w) throw new HttpError(400, 'Give a start and an end time (ms), with the end after the start.')
    return openGrid(adminDb(), w.from, w.to)
  }, { 'Cache-Control': 'private, no-store' })
}
