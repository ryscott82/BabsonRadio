import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { requireBoothCaller } from '@/lib/server/booth'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'

export const runtime = 'nodejs'

// For the studio PC's idle screen (nobody signed in): what is on now and next in the next ~36 hours, with the hosts' names,
// and the training video. Needs the studio PC's signed nonce (x-booth-nonce and x-booth-sig headers) or a signed-in member.
// The page asks once and then every 5 minutes.
export async function GET(req: Request) {
  return handle(async () => {
    await requireBoothCaller(req)
    const items = await buildScheduleFeed(adminDb(), { days: 2, showStudentHosts: true, back: 0 })
    const now = Date.now()
    return {
      items: items
        .filter(i => i.endAt > now && i.startAt < now + 36 * 3_600_000)
        .sort((a, b) => a.startAt - b.startAt)
        .slice(0, 8)
        .map(i => ({ id: i.id, title: i.title, hosts: i.hosts, startAt: i.startAt, endAt: i.endAt, category: i.category, source: i.source })),
      trainingVideoId: process.env.BOOTH_TRAINING_VIDEO_ID ?? '',
    }
  }, { 'Cache-Control': 'private, no-store' })
}
