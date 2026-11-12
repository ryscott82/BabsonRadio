import { handle } from '@/lib/server/http'
import { refreshNowPlaying } from '@/lib/server/nowplaying'
import { requireWorker } from '@/lib/server/worker'
import { adminDb } from '@/lib/server/admin'
import { runAutoApprove } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'

// The schedule check: looks at AzuraCast now and records any correction to the schedule (the same logic the AzuraCast webhook runs).
// The studio PC calls this every 15 minutes (job type schedule.reconcile also calls it once). The daily Vercel cron does it too, as a fallback.
export async function POST(req: Request) {
  return handle(async () => {
    await requireWorker(req)
    await refreshNowPlaying()
    // Every 15 minutes, so show requests whose 24-hour wait is over are approved close to on time while the studio PC is on.
    const slots = await runAutoApprove(adminDb()).catch(e => { console.error('[auto approve]', e); return null })
    return { ok: true, at: Date.now(), slots }
  })
}
