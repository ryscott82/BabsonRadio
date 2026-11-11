import { adminDb } from '@/lib/server/admin'
import { after } from 'next/server'
import { handle, requireUser } from '@/lib/server/http'
import { publishLiveState } from '@/lib/server/liveState'
import { buildMe, buildShared } from '@/lib/server/liveBundle'
import { cacheControlFor, cleanOcc, sectionsOf, wantOf, type BundleReply } from '@/lib/liveBundle'

export const runtime = 'nodejs'

// The live page's data in one call (replaces separate calls to presence, skip, vote, setlist, emojis, rating and host access).
//   GET /api/live/bundle?part=shared[&occId=…]   no sign-in needed. Same for everyone, so Vercel's edge serves it for 60 s (and
//                                                refreshes it in the background for 120 s more): most calls run no function at all. It is the
//                                                "who is tuned in" snapshot (count), the show rating and the tallies as first loaded; later tallies are
//                                                pushed through Firestore (liveState/current), so nobody needs to poll this.
//   GET /api/live/bundle?part=me[&sections=…][&occId=…]   needs sign-in. Your own friends, skip / vote / stars, reactions, host access.
//                                                Never cached. While playing, the same data comes back with the listening check-in (POST /api/listen),
//                                                so ask for it only when nothing is playing: on page load, once per show, and when a hidden page returns.
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
    // Whoever builds the shared half also keeps the pushed document (liveState/current) up to date. It writes only if something changed.
    const sh = out.shared
    if (sh) after(() => publishLiveState(db, sh, () => buildShared(db, '', Date.now()), now).then(() => undefined).catch(e => console.error('[live state]', e)))
    return out
  }, { 'Cache-Control': cacheControlFor(want) })
}
