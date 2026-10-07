import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { buildScheduleFeed } from '@/lib/server/scheduleFeed'

export const runtime = 'nodejs'

// The schedule for the next N days (default 7, max 30). Anyone can read it. Students' first names on
// approved slots are only included for signed-in members.
export async function GET(req: Request) {
  return handle(async () => {
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7))
    const member = await requireMember(req).then(() => true, () => false)
    return { items: await buildScheduleFeed(adminDb(), { days, showStudentHosts: member }) }
  })
}
