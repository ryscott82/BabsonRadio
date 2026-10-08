import { adminDb } from '@/lib/server/admin'
import { handle, requireUser } from '@/lib/server/http'

export const runtime = 'nodejs'

// Everything this person has rated, newest first: whole shows and single songs.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const db = adminDb()
    const [shows, songs] = await Promise.all([
      db.collection('ratings').where('uid', '==', t.uid).get(),
      db.collection('songRatings').where('uid', '==', t.uid).get(),
    ])
    const ms = (d: FirebaseFirestore.QueryDocumentSnapshot) => (d.get('at')?.toMillis?.() as number | undefined) ?? 0
    return {
      shows: shows.docs.map(d => ({ occId: d.get('occId'), showKey: d.get('showKey') ?? '', title: d.get('showTitle') ?? '', stars: d.get('stars'), at: ms(d) })).sort((a, b) => b.at - a.at).slice(0, 200),
      songs: songs.docs.map(d => ({ songId: d.get('songId'), title: d.get('title'), artist: d.get('artist'), stars: d.get('stars'), at: ms(d) })).sort((a, b) => b.at - a.at).slice(0, 300),
    }
  })
}
