import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { episodesByIds, myEpisodeIds, recentEpisodes, recommend } from '@/lib/server/episodes'

export const runtime = 'nodejs'

const ID = /^[A-Za-z0-9_-]{1,100}$/

// The person's library: what they saved, and "Based on your interests" (from what they saved and liked).
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const db = adminDb()
    const mine = await myEpisodeIds(db, t.uid)
    const [all, saved, liked] = await Promise.all([
      recentEpisodes(db, 200), episodesByIds(db, mine.saved), episodesByIds(db, mine.liked),
    ])
    // Keep the order they saved them in (newest first).
    const order = new Map(mine.saved.map((id, i) => [id, i]))
    saved.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const forYou = recommend(all, [...saved, ...liked], new Set(mine.saved))
    return { saved, savedIds: mine.saved, forYou }
  })
}

// Save or remove an episode: { episodeId, saved: boolean }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    const episodeId = str(b.episodeId, 100)
    if (!ID.test(episodeId)) throw new HttpError(400, 'Bad episode.')
    const ref = adminDb().collection('users').doc(t.uid).collection('saved').doc(episodeId)
    if (b.saved === true) {
      if (!(await adminDb().collection('episodes').doc(episodeId).get()).exists) throw new HttpError(404, 'That episode is gone.')
      await ref.set({ at: Timestamp.now() })
    } else await ref.delete()
    return { ok: true }
  })
}
