import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { runReminders } from '@/lib/server/reminders'

export const runtime = 'nodejs'

// Show reminders for hosts. Not a Vercel cron (Hobby allows two and both are used): a free outside pinger (cron-job.org) calls it every 10 minutes:
//   GET https://babsonradio.com/api/cron/reminders   with the header   Authorization: Bearer <CRON_SECRET>
// Add ?dry=1 to see what would be sent without sending or logging anything. Safe to call twice at once: each reminder is claimed in reminderLog before it is sent.
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    const dry = new URL(req.url).searchParams.get('dry') === '1'
    const r = await runReminders(adminDb(), { dry })
    return dry ? { ok: true, dry: true, checked: r.checked, wouldSend: r.due } : { ok: true, checked: r.checked, due: r.due.length, sent: r.sent.length, skipped: r.skipped }
  }, { 'Cache-Control': 'no-store' })
}
