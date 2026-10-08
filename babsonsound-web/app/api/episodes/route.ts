import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { recentEpisodes } from '@/lib/server/episodes'

export const runtime = 'nodejs'

// Episodes for browsing and search (students and developers only). ?q= filters by title, show or category.
// Also says which ones I have saved so the save buttons show the right state.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80)
    const [all, saved] = await Promise.all([
      recentEpisodes(db, 200),
      db.collection('users').doc(t.uid).collection('saved').select().get(),
    ])
    const items = q ? all.filter(e => `${e.title} ${e.showName} ${e.category}`.toLowerCase().includes(q)) : all
    return { items, savedIds: saved.docs.map(d => d.id) }
  })
}
