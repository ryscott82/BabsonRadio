import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { rebuildAutoSchedule } from '@/lib/server/autoschedule'

export const runtime = 'nodejs'

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.')
    const r = await rebuildAutoSchedule(adminDb())
    return { ok: true, planned: r.blocks.length, kept: r.kept }
  })
}
