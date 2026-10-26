import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { currentOnAir, parseSongs } from '@/lib/server/live'

export const runtime = 'nodejs'

// The set list the host entered for the show on air, with upvotes. Public to read; members can upvote.
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur || !cur.isShow) return { occId: '', title: '', songs: [] }
    const [list, votes] = await Promise.all([
      db.collection('setlists').doc(cur.occId).get(),
      db.collection('setlistVotes').doc(cur.occId).get(),
    ])
    const v = (votes.get('votes') ?? {}) as Record<string, string[]>
    const uid = await requireUser(req).then(t => t.uid, () => '')
    const songs = parseSongs(String(list.get('songs') ?? '')).map(s => ({
      ...s, votes: v[s.id]?.length ?? 0, mine: !!uid && (v[s.id] ?? []).includes(uid),
    }))
    return { occId: cur.occId, title: cur.item.title, songs }
  }, { 'Cache-Control': req.headers.get('authorization') ? 'private, no-store' : 'public, s-maxage=5, stale-while-revalidate=10' }) // signed-out copy has no "mine" marks
}

// Toggle your upvote on a song: { songId }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const songId = str((await readJson(req)).songId, 20)
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur || !cur.isShow) throw new HttpError(409, 'No show is on air.')
    const list = await db.collection('setlists').doc(cur.occId).get()
    if (!parseSongs(String(list.get('songs') ?? '')).some(s => s.id === songId)) throw new HttpError(404, 'That song is not on the set list.')
    const ref = db.collection('setlistVotes').doc(cur.occId)
    const had = ((await ref.get()).get(`votes.${songId}`) as string[] | undefined)?.includes(t.uid) ?? false
    await ref.set({ votes: { [songId]: had ? FieldValue.arrayRemove(t.uid) : FieldValue.arrayUnion(t.uid) } }, { merge: true })
    return { ok: true, mine: !had }
  })
}
