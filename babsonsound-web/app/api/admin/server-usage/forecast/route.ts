import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { usageForecast } from '@/lib/server/serverUsage'

export const runtime = 'nodejs'

// Month to date (from the latest entry and from our own meter), projected month end, days until the allowance runs out at the current
// rate, CPU per listener-hour, and this month's alerts. Admin only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return usageForecast(adminDb()) }, { 'Cache-Control': 'private, no-store' })
}
