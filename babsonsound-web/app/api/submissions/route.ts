import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// Song suggestions and playlist submissions for the station to consider. Nothing plays because of these.
// kind 'song': title + artist. kind 'playlist': a link to the playlist (Spotify, Apple Music, YouTube...) + a name.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const kind = b.kind === 'playlist' ? 'playlist' : 'song'
    const title = str(b.title, 120), artist = str(b.artist, 120), url = str(b.url, 400), note = str(b.note, 300)
    if (kind === 'song') {
      if (title.length < 2) throw new HttpError(400, 'Type the song title.')
      if (artist.length < 2) throw new HttpError(400, 'Type the artist.')
    } else {
      if (title.length < 2) throw new HttpError(400, 'Give the playlist a name.')
      let u: URL
      try { u = new URL(url) } catch { throw new HttpError(400, 'Paste a link to the playlist.') }
      if (u.protocol !== 'https:') throw new HttpError(400, 'The link must start with https://')
    }
    const db = adminDb()
    const dayAgo = Date.now() - 24 * 3600_000
    const mine = await db.collection('submissions').where('uid', '==', t.uid).get()
    if (mine.docs.filter(d => (d.get('at')?.toMillis?.() ?? 0) > dayAgo).length >= 5) {
      throw new HttpError(429, 'That is 5 today. Try again tomorrow.')
    }
    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('submissions').add({
      uid: t.uid, name: String(u.get('firstName') ?? u.get('displayName') ?? 'Listener'),
      kind, title, artist: kind === 'song' ? artist : '', url: kind === 'playlist' ? url : '', note,
      at: Timestamp.now(), done: false,
    })
    return { ok: true }
  })
}
