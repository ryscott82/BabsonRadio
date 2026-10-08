import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { visibleFriends } from '@/lib/server/friends'

export const runtime = 'nodejs'

const ID = /^[A-Za-z0-9_-]{1,100}$/

// Like / unlike an episode. Students and developers only (guests never see episodes).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    const episodeId = str(b.episodeId, 100)
    if (!ID.test(episodeId)) throw new HttpError(400, 'Bad episode.')
    const ref = adminDb().collection('likes').doc(`${episodeId}_${t.uid}`)
    if (b.liked === true) await ref.set({ episodeId, uid: t.uid, createdAt: Timestamp.now() })
    else await ref.delete()
    return { ok: true }
  })
}

// GET /api/likes?ids=a,b,c  →  which of these I liked, and which visible friends liked them.
// Friends who are in invisible mode never appear.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(i => ID.test(i)).slice(0, 30)
    const db = adminDb()
    if (!ids.length) return { liked: [], friends: {} }

    const mine = await db.getAll(...ids.map(id => db.collection('likes').doc(`${id}_${t.uid}`)))
    const liked = mine.filter(d => d.exists).map(d => d.get('episodeId') as string)

    const people = await visibleFriends(db, t.uid)
    const friends: Record<string, string[]> = {}
    if (people.size) {
      await Promise.all(ids.map(async id => {
        const snap = await db.collection('likes').where('episodeId', '==', id).limit(500).get()
        const names = snap.docs.map(d => people.get(d.get('uid') as string)).filter((n): n is string => !!n)
        if (names.length) friends[id] = names.slice(0, 5)
      }))
    }
    return { liked, friends }
  })
}
