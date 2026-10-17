import { HttpError, handle } from '@/lib/server/http'
import { refreshNowPlaying } from '@/lib/server/nowplaying'

export const runtime = 'nodejs'

// AzuraCast calls this whenever the song changes (Station > Web Hooks > Generic Web Hook), so schedule corrections are
// recorded even when nobody has the site or app open. We ignore the body and look at AzuraCast ourselves.
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
    return { ok: true }
  })
}

export const POST = run
export const GET = run
