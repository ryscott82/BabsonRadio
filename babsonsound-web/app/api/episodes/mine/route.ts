import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { adultStatus } from '@/lib/server/publicContent'
import { toEpisode } from '@/lib/server/episodes'

export const runtime = 'nodejs'

// Episodes I host, with whether I may make them public. { status, items }
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const [status, snap] = await Promise.all([
      adultStatus(db, t.uid),
      db.collection('episodes').where('hostUids', 'array-contains', t.uid).limit(100).get(),
    ])
    const items = snap.docs.map(d => toEpisode(d.id, d.data())).sort((a, b) => b.publishedAt - a.publishedAt)
    return { status, items }
  })
}
