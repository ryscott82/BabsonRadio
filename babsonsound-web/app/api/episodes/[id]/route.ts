import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { toEpisode } from '@/lib/server/episodes'
import { isEpisodeId, matchSetlist } from '@/lib/episodePlayer'

export const runtime = 'nodejs'

// One episode for its own page (/episode/<id>): its details and, for a live show, the set list the host entered. A public episode opens for anyone
// (that is what a shared link needs); a private one needs a signed-in Babson student, like the rest of the Library.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params
    if (!isEpisodeId(id)) throw new HttpError(400, 'Bad episode.')
    const db = adminDb()
    const snap = await db.collection('episodes').doc(id).get()
    if (!snap.exists) throw new HttpError(404, 'Episode not found.', 'BR-EPI-001')
    const ep = toEpisode(snap.id, snap.data()!)
    if (ep.visibility !== 'public') await requireLibrary(req)
    let setlist: string[] = []
    if (ep.audio && ep.publishedAt) {
      const at = (ms: number) => Timestamp.fromMillis(ms)
      const hit = await db.collection('setlists').where('startAt', '>=', at(ep.publishedAt - 12 * 3_600_000)).where('startAt', '<=', at(ep.publishedAt + 12 * 3_600_000)).limit(20).get()
        .catch(() => null)
      setlist = matchSetlist((hit?.docs ?? []).map(d => ({ showTitle: String(d.get('showTitle') ?? ''), startAt: (d.get('startAt') as Timestamp).toMillis(), songs: String(d.get('songs') ?? '') })), [ep.title, ep.showName], ep.publishedAt)
    }
    const { hostUids: _hosts, ...out } = ep // eslint-disable-line @typescript-eslint/no-unused-vars -- account ids are not for the page
    return { episode: out, setlist }
  }, { 'Cache-Control': req.headers.get('authorization') ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300' })
}
