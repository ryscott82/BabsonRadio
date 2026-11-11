import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, requireUser, str } from '@/lib/server/http'
import { currentOnAir, parseSongs } from '@/lib/server/live'
import { forgetSetlist, setlistData } from '@/lib/server/liveData'
import { after } from 'next/server'
import { forgetOld, oldPoll } from '@/lib/server/oldRoute'
import { throttled } from '@/lib/server/tierGate'
import { publishNow } from '@/lib/server/liveStateTick'

export const runtime = 'nodejs'

// The set list the host entered for the show on air, with upvotes. Public to read; members can upvote.
// (The web page now gets this from /api/live/bundle; this route stays for older app builds.)
export async function GET(req: Request) {
  return handle(async () => {
    const uid = await requireUser(req).then(t => t.uid, () => '')
    const read = async () => {
      const db = adminDb()
      const cur = await currentOnAir(db)
      const hit = await setlistData(db, cur)
      if (!hit.occId) return { occId: '', title: '', songs: [] as { id: string; text: string; votes: number; mine: boolean }[] }
      const v = hit.votes
      const songs = hit.songs.map(s => ({
        ...s, votes: v[s.id]?.length ?? 0, mine: !!uid && (v[s.id] ?? []).includes(uid),
      }))
      return { occId: hit.occId, title: hit.title, songs }
    }
    // Signed-in readers are older apps: they get the last answer for 30 s (lib/server/oldRoute.ts). Signed-out readers share an edge copy.
    return uid ? throttled('setlist', uid, { occId: '', title: '', songs: [] }, () => oldPoll('setlist', uid, read)) : read()
  }, { 'Cache-Control': req.headers.get('authorization') ? 'private, no-store' : 'public, s-maxage=30, stale-while-revalidate=60' }) // signed-out copy has no "mine" marks
}

// Toggle your upvote on a song: { songId }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const songId = str((await readJson(req)).songId, 20)
    return throttled('setlist', t.uid, { ok: true, mine: false }, () => toggle(t.uid, songId), 'w')
  })
}

async function toggle(uid: string, songId: string) {
  {
    const t = { uid }
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur || !cur.isShow) throw new HttpError(409, 'No show is on air.')
    const list = await db.collection('setlists').doc(cur.occId).get()
    if (!parseSongs(String(list.get('songs') ?? '')).some(s => s.id === songId)) throw new HttpError(404, 'That song is not on the set list.')
    const ref = db.collection('setlistVotes').doc(cur.occId)
    const had = ((await ref.get()).get(`votes.${songId}`) as string[] | undefined)?.includes(t.uid) ?? false
    await ref.set({ votes: { [songId]: had ? FieldValue.arrayRemove(t.uid) : FieldValue.arrayUnion(t.uid) } }, { merge: true })
    forgetSetlist(cur.occId)
    forgetOld('setlist', uid)
    after(() => publishNow(db).then(() => undefined).catch(() => {})) // the new count goes to everyone's page
    return { ok: true, mine: !had }
  }
}
