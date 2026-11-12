import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { checkInNow } from '@/lib/server/studioBook'

export const runtime = 'nodejs'

// The person at the studio PC checks in: their booking for right now (from 15 minutes before it starts) becomes checked in. Reply { ok, checkedIn, bookingId? } (bookingId also when it was already checked in).
// A walk-in has no booking, so nothing happens ({ ok: true, checkedIn: false }): walk-ins never need one.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await accessOf(t)).level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
    return checkInNow(adminDb(), t.uid)
  })
}
