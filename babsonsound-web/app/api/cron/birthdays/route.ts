import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { birthdaysToday } from '@/lib/server/birthdays'
import { notifyUsers } from '@/lib/server/push'
import { runUnverifiedSweep } from '@/lib/server/unverified'
import { runStudioExpiryNotices } from '@/lib/server/studioNotices'
import { runUsageReminder } from '@/lib/server/serverUsage'
import { runAutoApprove } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'
export const maxDuration = 60

// Called once a morning by Vercel Cron (see vercel.json): a happy-birthday notification to people who have it turned on.
// The same run also reminds and deletes accounts that never verified their email (lib/server/unverified.ts) and sends Studio training
// expiry notices (lib/server/studioNotices.ts), and, on Mondays (Eastern), the weekly "enter this week's Vercel usage" email to the owners
// (lib/server/serverUsage.ts, skipped if an entry was made in the last 6 days), and approves show requests whose 24-hour wait is over (lib/server/autoApprove.ts). Vercel's free plan allows two cron jobs, so nothing new is added.
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    const today = await birthdaysToday(adminDb())
    const sent = await notifyUsers('birthday', today.map(p => p.uid), { title: 'Happy birthday! 🎂', body: 'From everyone at Babson Radio. Tune in and we might play something for you.' })
    const cleanup = await runUnverifiedSweep().catch(e => { console.error('[unverified sweep]', e); return null })
    const training = await runStudioExpiryNotices().catch(e => { console.error('[studio notices]', e); return null })
    const reminder = await runUsageReminder().catch(e => { console.error('[usage reminder]', e); return null })
    const slots = await runAutoApprove(adminDb()).catch(e => { console.error('[auto approve]', e); return null })
    return { ok: true, birthdays: today.length, sent, cleanup, training, reminder, slots }
  })
}
