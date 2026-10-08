import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { currentOnAir, songId } from '@/lib/server/live'
import { getNowPlaying } from '@/lib/server/nowplaying'
import { noteStars } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// Rate the song that is playing (1 to 5). Saved per person and per song, with the show or genre block it aired in,
// so the auto-scheduler can learn what people like.
const keyOf = (artist: string, title: string) => songId(`${artist} - ${title}`)

export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url)
    const title = str(u.searchParams.get('title'), 120), artist = str(u.searchParams.get('artist'), 120)
    const t = await requireUser(req).catch(() => null)
    if (!t || !title) return { mine: 0 }
    const d = await adminDb().collection('songRatings').doc(`${t.uid}__${keyOf(artist, title)}`).get()
    return { mine: (d.get('stars') as number | undefined) ?? 0 }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const title = str(b.title, 120), artist = str(b.artist, 120), stars = Number(b.stars)
    if (!title) throw new HttpError(400, 'Nothing to rate yet.')
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Pick 1 to 5 stars.')
    const np = await getNowPlaying()
    const same = (a: string, c: string) => a.trim().toLowerCase() === c.trim().toLowerCase()
    const matches = (np.title && same(np.title, title) && same(np.artist, artist)) || (np.next && same(np.next.title, title))
    if (!matches) throw new HttpError(409, 'That song just changed.')
    const db = adminDb()
    const cur = await currentOnAir(db).catch(() => null)
    await db.collection('songRatings').doc(`${t.uid}__${keyOf(artist, title)}`).set({
      uid: t.uid, songId: keyOf(artist, title), title, artist, stars,
      label: cur?.item.title ?? '', occId: cur?.occId ?? '', isShow: cur?.isShow ?? false, at: Timestamp.now(),
    })
    await noteStars(db, t.uid, `s:${keyOf(artist, title)}`, stars).catch(() => {})
    return { ok: true }
  })
}
