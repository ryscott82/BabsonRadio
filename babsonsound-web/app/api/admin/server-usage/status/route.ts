import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { usageStatus } from '@/lib/server/serverUsage'

export const runtime = 'nodejs'

// The short summary for the banner on every admin page and for the iOS admin:
//   { month, allowanceHours, hours, pct, source: 'entry'|'meter', entryDate, projectedMonthEnd, projectedOver, daysUntilExhausted,
//     tiers: { "1"|"2"|"3": { level: 'normal'|'tight'|'critical', locked } }, overall: 'normal'|'tight'|'critical' }
// Each server keeps the answer for 5 minutes, so opening several admin pages in a row reads the month once. Admin only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return usageStatus(adminDb()) }, { 'Cache-Control': 'private, no-store' })
}
