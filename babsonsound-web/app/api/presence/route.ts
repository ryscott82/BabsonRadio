import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { presenceFriends, recordPresence } from '@/lib/server/liveData'
import type { ListeningGroup } from '@/lib/server/groups'
import { listeningIds } from '@/lib/server/skipVotes'

export const runtime = 'nodejs'

// Apps call this when playing starts and stops (listening: true / false). While playing, the listening check-in (/api/listen)
// refreshes it too, so a separate heartbeat is no longer needed; older apps still send one every ~2 minutes and that works as before.
// Clients never read or write presence directly (Firestore rules deny it).
// The listening log and the presence rules live in lib/server/liveData.ts (recordPresence).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const body = await readJson(req)
    await recordPresence(adminDb(), t.uid, body.listening === true, body.platform === 'ios' ? 'ios' : 'web')
    return { ok: true }
  })
}

// Anyone can see how many are tuned in (invisible people count anonymously).
// Verified students additionally see the first names of connected contacts who are tuned in
// and not invisible.
// (The web page now gets this from /api/live/bundle; this route stays for older app builds.)
export async function GET(req: Request) {
  // Signed-out callers get the same answer as everyone else (just the count), so it can be cached at the edge for a few seconds.
  // Signed-in answers include friends and groups, so they are never shared.
  const anon = !req.headers.get('authorization')
  return handle(async () => {
    const db = adminDb()
    const listening = await listeningIds(db, Date.now())

    let friends: { uid: string; firstName: string; instagram?: string }[] = []
    let groups: ListeningGroup[] = []
    if (req.headers.get('authorization')) {
      const t = await requireUser(req).catch(() => null)
      if (t && (await accessOf(t)).level !== 'guest') ({ friends, groups } = await presenceFriends(db, t, listening))
    }
    return { count: listening.size, friends, groups }
  }, { 'Cache-Control': anon ? 'public, s-maxage=10, stale-while-revalidate=20' : 'private, no-store' })
}
