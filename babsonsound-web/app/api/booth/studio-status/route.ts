import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { requireBoothCaller } from '@/lib/server/booth'
import { boothStudioStatus } from '@/lib/server/studioBook'

export const runtime = 'nodejs'

// For the studio PC page: { nextBooking, bookings: [{ id, startAt, endAt, name }] (up to 3, first names), quiet, quietUntil, quietStartsAt, capacity, warning? }. The page asks once when it opens and then at most
// every 5 minutes. Needs the studio PC's signed nonce (x-booth-nonce and x-booth-sig headers) or a signed-in member. Kept 60 s on the server. Never kicks anyone out.
export async function GET(req: Request) {
  return handle(async () => {
    await requireBoothCaller(req)
    return boothStudioStatus(adminDb())
  }, { 'Cache-Control': 'private, no-store' })
}
