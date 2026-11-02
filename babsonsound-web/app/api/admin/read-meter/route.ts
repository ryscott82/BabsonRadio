import { handle, requireAdmin } from '@/lib/server/http'
import { readMeterSnapshot } from '@/lib/server/readMeter'

export const runtime = 'nodejs'

// TEMPORARY. Per-route Firestore document reads for the last 60 minutes, for the instance that answers (each Vercel instance
// keeps its own counts; the full picture is the "[firestore-reads]" lines in Vercel Logs, one per minute per instance).
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const minutes = readMeterSnapshot()
    const totals: Record<string, { reads: number; requests: number }> = {}
    for (const m of minutes) for (const [k, v] of Object.entries(m.routes)) {
      const t = (totals[k] ??= { reads: 0, requests: 0 }); t.reads += v.reads; t.requests += v.requests
    }
    return { note: 'This instance only. Minutes are UTC.', minutes, totals }
  })
}
