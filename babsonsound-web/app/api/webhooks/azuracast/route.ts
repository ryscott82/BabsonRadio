import { HttpError, handle } from '@/lib/server/http'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { getNowPlaying, refreshNowPlaying } from '@/lib/server/nowplaying'
import { liveStateTick } from '@/lib/server/liveStateTick'

export const runtime = 'nodejs'

// AzuraCast calls this whenever the song changes (Station > Web Hooks > Generic Web Hook), so schedule corrections are
// recorded even when nobody has the site or app open. We ignore the body and look at AzuraCast ourselves.
// It also keeps the pushed live state (liveState/current: skip tally, vote tally, set list) in step with the new song, so that does not depend on
// anyone's page asking for now playing.
//   URL:  https://babsonradio.com/api/webhooks/azuracast?k=<AZURACAST_WEBHOOK_SECRET, or CRON_SECRET>
function check(req: Request) {
  const secret = process.env.AZURACAST_WEBHOOK_SECRET || process.env.CRON_SECRET
  const given = new URL(req.url).searchParams.get('k') ?? req.headers.get('x-monitor-key')
  if (!secret || given !== secret) throw new HttpError(401, 'Not allowed.')
}

async function run(req: Request) {
  return handle(async () => {
    check(req)
    await refreshNowPlaying()
    const np = await getNowPlaying()
    after(() => liveStateTick(adminDb(), np))
    return { ok: true }
  })
}

export const POST = run
export const GET = run
