import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { birthdaysToday } from '@/lib/server/birthdays'
import { notifyUsers } from '@/lib/server/push'
import { runUnverifiedSweep } from '@/lib/server/unverified'

export const runtime = 'nodejs'
export const maxDuration = 60

// Called once a morning by Vercel Cron (see vercel.json): a happy-birthday notification to people who have it turned on.
// The same run also reminds and deletes accounts that never verified their email (lib/server/unverified.ts), so no extra cron is needed.
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    const today = await birthdaysToday(adminDb())
    const sent = await notifyUsers('birthday', today.map(p => p.uid), { title: 'Happy birthday! 🎂', body: 'From everyone at Babson Radio. Tune in and we might play something for you.' })
    const cleanup = await runUnverifiedSweep().catch(e => { console.error('[unverified sweep]', e); return null })
    return { ok: true, birthdays: today.length, sent, cleanup }
  })
}
