import { handle, requireAdmin, tokenCacheStats } from '@/lib/server/http'
import { cpuMeterSnapshot } from '@/lib/server/cpuMeter'
import { readMeterSnapshot } from '@/lib/server/readMeter'
import { totalsOf } from '@/lib/cpuMeterCore'

export const runtime = 'nodejs'

// Per-route server time (CPU) and Firestore reads for the last 60 minutes, for the server instance that answers (each Vercel instance
// keeps its own counts; the full picture is the "[cpu-meter]" and "[firestore-reads]" lines in Vercel Logs, one per minute per instance).
// The page is /admin/server-load. Vercel's own Usage page (Fluid Active CPU, by route) is the bill; this is how to see what to cut.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const minutes = cpuMeterSnapshot()
    const reads: Record<string, { reads: number }> = {}
    for (const m of readMeterSnapshot()) for (const [k, v] of Object.entries(m.routes)) (reads[k] ??= { reads: 0 }).reads += v.reads
    return {
      note: 'This server instance only. Minutes are UTC. Totals per minute are exact; the split between routes is an estimate.',
      totals: totalsOf(minutes, reads),
      minutes,
      tokenCache: tokenCacheStats(),
    }
  })
}
