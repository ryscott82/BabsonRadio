import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { presenceFriends, recordPresence } from '@/lib/server/liveData'
import type { ListeningGroup } from '@/lib/server/groups'
import { listeningIds } from '@/lib/server/skipVotes'
import { oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'

export const runtime = 'nodejs'

// Older apps call this when playing starts and stops (listening: true / false) and every ~2 minutes while playing; that still works. New builds
// do not call it: the listening check-in (POST /api/listen) records presence at play, every ~12 minutes, and on stop. Someone counts as tuned in
// for 18 minutes after their last record (PRESENCE_TTL_MS).
// Clients never read or write presence directly (Firestore rules deny it).
// The listening log and the presence rules live in lib/server/liveData.ts (recordPresence).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const body = await readJson(req)
    const listening = body.listening === true
    // Tier 2: when server time is short, "started / still playing" is accepted without being recorded (stopping always is: it is one cheap write).
    if (!listening) { await recordPresence(adminDb(), t.uid, false, body.platform === 'ios' ? 'ios' : 'web'); return { ok: true } }
    return throttled('presence', t.uid, { ok: true }, async () => { await recordPresence(adminDb(), t.uid, true, body.platform === 'ios' ? 'ios' : 'web'); return { ok: true } }, 'w')
  })
}

// Anyone can see how many are tuned in (invisible people count anonymously).
// Verified students additionally see the first names of connected contacts who are tuned in
// and not invisible.
// (The web page now gets this from /api/live/bundle; this route stays for older app builds. Signed-in older apps get the last answer for 60 s,
// signed-out callers share an edge copy for 60 s.)
export async function GET(req: Request) {
  // Signed-out callers get the same answer as everyone else (just the count), so it can be cached at the edge for a few seconds.
  // Signed-in answers include friends and groups, so they are never shared.
  const anon = !req.headers.get('authorization')
  return handle(async () => {
    const db = adminDb()
    const read = async (t: Awaited<ReturnType<typeof requireUser>> | null) => {
      const listening = await listeningIds(db, Date.now())
      let friends: { uid: string; firstName: string; instagram?: string }[] = []
      let groups: ListeningGroup[] = []
      if (t && (await accessOf(t)).level !== 'guest') ({ friends, groups } = await presenceFriends(db, t, listening))
      return { count: listening.size, friends, groups }
    }
    if (anon) return read(null)
    const t = await requireUser(req).catch(() => null)
    return t ? throttled('presence', t.uid, { count: 0, friends: [], groups: [] as ListeningGroup[] }, () => oldPoll('presence', t.uid, () => read(t))) : read(null)
  }, { 'Cache-Control': anon ? 'public, s-maxage=60, stale-while-revalidate=120' : 'private, max-age=15' })
}
