import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, requireUser } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { reactionSummary } from '@/lib/server/live'

export const runtime = 'nodejs'

// What the studio PC shows about the audience right now: listeners, reactions and song requests for the airing on now.
// Uses the cached now-playing feed, so polling it every 15 seconds costs about one Firestore read per reaction doc.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    if ((await accessOf(t)).level === 'guest') throw new HttpError(403, 'This is for Babson, Olin and Wellesley students.', 'BR-PERM-001')
    const db = adminDb()
    const np = await getNowPlaying()
    const base = { listeners: np.listeners, isLive: np.isLive, occId: np.occId, showTitle: np.showTitle, showEnd: np.showEnd }
    if (!np.occId || !np.isShow) return { ...base, reactions: {}, recentReactions: {}, requestsOpen: false, requests: [] }
    const [rx, rq, list] = await Promise.all([
      reactionSummary(db, np.occId),
      db.collection('liveRequests').doc(np.occId).get(),
      db.collection('songRequests').where('occId', '==', np.occId).get(),
    ])
    return {
      ...base,
      reactions: rx.total, recentReactions: rx.recent,
      requestsOpen: rq.exists && rq.get('open') === true,
      requests: list.docs.map(d => ({ id: d.id, text: String(d.get('text') ?? ''), name: String(d.get('name') ?? ''), at: d.get('at')?.toMillis?.() ?? 0 }))
        .sort((a, b) => b.at - a.at).slice(0, 20),
    }
  })
}
