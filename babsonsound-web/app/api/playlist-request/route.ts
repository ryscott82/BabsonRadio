import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { firstNameOf } from '@/lib/server/names'
import { assertClean } from '@/lib/server/wordFilter'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { requireLibrary } from '@/lib/server/guests'
import { currentOnAir } from '@/lib/server/live'
import { norm, requestablePlaylists } from '@/lib/server/playlistRequests'

export const runtime = 'nodejs'

// Ask for a song to be added to one of the station's playlists. Not a "play it now" request: staff or the host
// of the show on air see the list and add what fits. Signed-in people with library access only.
export async function GET(req: Request) {
  return handle(async () => {
    await requireLibrary(req)
    return { playlists: await requestablePlaylists() }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireLibrary(req)
    const b = await readJson(req)
    const title = str(b.title, 120), artist = str(b.artist, 120), playlist = str(b.playlist, 80)
    if (title.length < 2) throw new HttpError(400, 'Type the song title.')
    if (artist.length < 2) throw new HttpError(400, 'Type the artist.')
    const lists = await requestablePlaylists()
    if (!lists.includes(playlist)) throw new HttpError(400, 'Pick a playlist from the list.')

    const db = adminDb()
    await assertClean(db, title, artist)
    const dayAgo = Date.now() - 24 * 3600_000
    const mine = await db.collection('playlistRequests').where('uids', 'array-contains', t.uid).get()
    if (mine.docs.filter(d => (d.get('at')?.toMillis?.() ?? 0) > dayAgo).length >= 5) {
      throw new HttpError(429, 'You can send 5 playlist requests a day. Try again tomorrow.')
    }

    const key = `${norm(playlist)}|${norm(title)}|${norm(artist)}`
    const name = await firstNameOf(db, t.uid)
    const same = (await db.collection('playlistRequests').where('key', '==', key).get()).docs.find(d => d.get('done') !== true)
    if (same) {
      if ((same.get('uids') ?? []).includes(t.uid)) throw new HttpError(409, 'You already asked for that one.')
      await same.ref.update({ uids: FieldValue.arrayUnion(t.uid), names: FieldValue.arrayUnion(name) })
      return { ok: true }
    }

    // Who is on air right now decides where it shows up: a host's show gets it in their panel; the auto DJ means admins only.
    const cur = await currentOnAir(db).catch(() => null)
    await db.collection('playlistRequests').add({
      key, title, artist, playlist, uids: [t.uid], names: [name], at: Timestamp.now(), done: false,
      occId: cur?.isShow ? cur.occId : '', showTitle: cur?.isShow ? cur.item.title : '',
    })
    return { ok: true }
  })
}
