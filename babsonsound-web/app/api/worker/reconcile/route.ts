import { handle } from '@/lib/server/http'
import { refreshNowPlaying } from '@/lib/server/nowplaying'
import { requireWorker } from '@/lib/server/worker'

export const runtime = 'nodejs'

// The schedule check: looks at AzuraCast now and records any correction to the schedule (the same logic the AzuraCast webhook runs).
// The studio PC calls this every 15 minutes (job type schedule.reconcile also calls it once). The daily Vercel cron does it too, as a fallback.
export async function POST(req: Request) {
  return handle(async () => {
    await requireWorker(req)
    await refreshNowPlaying()
    return { ok: true, at: Date.now() }
  })
}
