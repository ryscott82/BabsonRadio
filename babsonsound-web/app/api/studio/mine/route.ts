import { adminDb } from '@/lib/server/admin'
import { handle, requireUser } from '@/lib/server/http'
import { myBookings, requireStudioBadge } from '@/lib/server/studioBook'

export const runtime = 'nodejs'

// My studio bookings (upcoming first, then the latest past ones), with my own guest lists. Members with the Studio badge. Not polled.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    await requireStudioBadge(t)
    return myBookings(adminDb(), t.uid)
  }, { 'Cache-Control': 'private, no-store' })
}
