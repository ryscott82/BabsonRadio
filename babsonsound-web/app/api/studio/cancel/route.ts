import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { cancelBooking, requireStudioBadge } from '@/lib/server/studioBook'

export const runtime = 'nodejs'

// Cancel one of my studio bookings: { id }. Free until the cutoff in Settings (default 2 hours before). After that it still cancels, and it is flagged
// for the E-board to review only when strikes.studioNoShow is on. Reply: { ok, late }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    await requireStudioBadge(t)
    const id = str((await readJson(req)).id, 100)
    if (!id) throw new HttpError(400, 'Pick a booking to cancel.', 'BR-BKG-006')
    return cancelBooking(adminDb(), t, id)
  })
}
