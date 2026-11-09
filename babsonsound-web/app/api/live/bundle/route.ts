import { adminDb } from '@/lib/server/admin'
import { handle, requireUser } from '@/lib/server/http'
import { buildMe, buildShared } from '@/lib/server/liveBundle'
import { cacheControlFor, cleanOcc, sectionsOf, wantOf, type BundleReply } from '@/lib/liveBundle'

export const runtime = 'nodejs'

// The live page's data in one call (replaces separate calls to presence, skip, vote, setlist, emojis, rating and host access).
//   GET /api/live/bundle?part=shared[&occId=…]   no sign-in needed. Same for everyone, so Vercel's edge serves it for 15 s (and
//                                                refreshes it in the background for 30 s more): most calls run no function at all.
//   GET /api/live/bundle?part=me[&sections=…][&occId=…]   needs sign-in. Your own friends, skip / vote / stars, reactions, host access.
//                                                Never cached. Ask for it every 2 minutes or so, and after you act.
//   GET /api/live/bundle   with the sign-in header and no `part`: both halves in one reply (for older apps that cannot split). Never cached.
//   sections  comma list of: presence, skip, vote, setlist, rating, emojis, host. Nothing = all. A section that fails is null.
//   occId     the show to rate (the one on air or one that ended in the last 45 minutes); without it there is no `rating`.
// Answer shape: lib/liveBundle.ts (BundleReply). The old routes still work.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const want = wantOf(u.searchParams.get('part'), !!req.headers.get('authorization'))
  const occId = cleanOcc(u.searchParams.get('occId'))
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const out: BundleReply = { v: 1 }
    if (want === 'me' || want === 'full') {
      const t = await requireUser(req)
      const [me, shared] = await Promise.all([
        buildMe(db, t, sectionsOf(u.searchParams.get('sections')), occId, now),
        want === 'full' ? buildShared(db, occId, now) : Promise.resolve(undefined),
      ])
      out.me = me
      if (shared) out.shared = shared
    } else {
      out.shared = await buildShared(db, occId, now)
    }
    return out
  }, { 'Cache-Control': cacheControlFor(want) })
}
