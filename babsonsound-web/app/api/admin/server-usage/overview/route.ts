import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { usageOverview } from '@/lib/server/serverUsage'

export const runtime = 'nodejs'

// Everything the Server load page shows, in one call (so opening the page costs one server run, and there is no polling): the usage readings,
// our own meter by day, the forecast, the tier levels and locks, this month's alert history, cost per listener-hour over time and the
// per-route table of the server that answers. Admin only; nothing here is cached.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return usageOverview(adminDb()) }, { 'Cache-Control': 'private, no-store' })
}
