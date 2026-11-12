import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { runAutoApprove } from '@/lib/server/autoApprove'
import { runHousekeeping } from '@/lib/server/housekeeping'

export const runtime = 'nodejs'

// Not a Vercel cron (Hobby allows two and both are used). For a free outside pinger (cron-job.org, UptimeRobot, a GitHub Action) to call every 15 minutes:
//   GET https://babsonradio.com/api/cron/slots-auto   with the header   Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    const db = adminDb()
    return { ok: true, ...(await runAutoApprove(db)), housekeeping: await runHousekeeping(db) }
  }, { 'Cache-Control': 'no-store' })
}
