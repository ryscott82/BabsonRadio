import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'
import { loadConfig } from '@/lib/server/autoschedule'

export const runtime = 'nodejs'

// The schedule for the next N days (default 7, max 30). Anyone can read it. Students' first names on
// approved slots are only included for signed-in members.
export async function GET(req: Request) {
  return handle(async () => {
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7))
    const back = Math.min(14, Math.max(0, Number(new URL(req.url).searchParams.get('back')) || 0)) // past days to include
    const member = await requireMember(req).then(() => true, () => false)
    const db = adminDb()
    return {
      items: (await buildScheduleFeed(db, { days, showStudentHosts: member, back })).map(({ hostUids: _h, ...i }) => i),
      timezone: (await loadConfig(db)).timezone, // station time zone (the app uses it for weekly reminders)
    }
  }, { 'Cache-Control': req.headers.get('authorization') ? 'private, max-age=120' : 'public, s-maxage=300, stale-while-revalidate=600' }) // signed-out copy has no student names, so it is the same for everyone: the edge keeps it 5 minutes (Tier 0). A signed-in browser keeps its own copy 2 minutes.
}
