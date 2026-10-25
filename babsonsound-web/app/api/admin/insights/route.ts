import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { tasteStats } from '@/lib/server/taste'
import { loadConfig } from '@/lib/server/autoschedule'

export const runtime = 'nodejs'

// What listeners like, by genre block and show, over the last 60 days. Feeds the auto-scheduler.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const tz = (await loadConfig(adminDb())).timezone
    return { stats: await tasteStats(adminDb(), Date.now(), tz) }
  })
}
