import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'
import { refreshNowPlaying } from '@/lib/server/nowplaying'
import { runAutoApprove } from '@/lib/server/autoApprove'
import { runHousekeeping } from '@/lib/server/housekeeping'

export const runtime = 'nodejs'

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    // The 60-day taste scan (about 21,000 reads) runs every third day; the days in between reuse the saved result (1 read).
    const r = await rebuildAutoSchedule(adminDb(), { tasteMaxAgeMs: 60 * 3_600_000 })
    // Fallback for the studio PC's 15-minute schedule check (POST /api/worker/reconcile): once a day, in case the PC is off.
    await refreshNowPlaying().catch(() => {})
    // Show requests whose 24-hour wait is over (also run by the birthdays cron, the studio PC check and the site itself; see lib/server/autoApprove.ts).
    const slots = await runAutoApprove(adminDb()).catch(e => { console.error('[auto approve]', e); return null })
    // Strike flags, released studio bookings, guest deletion after 90 days, finished recordings (lib/server/housekeeping.ts).
    const housekeeping = await runHousekeeping(adminDb()).catch(e => { console.error('[housekeeping]', e); return null })
    return { ok: true, planned: r.blocks.length, kept: r.kept, slots, housekeeping }
  })
}
