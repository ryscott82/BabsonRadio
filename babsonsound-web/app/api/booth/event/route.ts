import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { EVENT_KINDS, clearBoothSong, recordEvent, setBoothSong } from '@/lib/server/booth'
import { refreshNowPlaying } from '@/lib/server/nowplaying'

export const runtime = 'nodejs'

// The studio PC page reports what happened: { sessionId, kind: live_start | live_stop | song | sign_out | idle_out }.
// A song also carries { title, artist }: it is shown on the site and app while the show is live.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const db = adminDb()
    const b = await readJson(req)
    const kind = str(b.kind, 20) as (typeof EVENT_KINDS)[number]
    if (!EVENT_KINDS.includes(kind)) throw new HttpError(400, 'Unknown event.')
    const sessionId = str(b.sessionId, 64)
    if (!sessionId) throw new HttpError(400, 'Missing session.')
    const title = str(b.title, 120), artist = str(b.artist, 120)
    if (kind === 'song' && !title) throw new HttpError(400, 'Type the song title.')
    await recordEvent(db, sessionId, t.uid, kind, kind === 'song' ? [artist, title].filter(Boolean).join(' - ') : '')
    if (kind === 'song') await setBoothSong(db, sessionId, title, artist)
    else if (kind !== 'live_start') await clearBoothSong(db, sessionId)
    if (kind !== 'live_start') after(() => refreshNowPlaying().catch(() => {}))
    return { ok: true }
  })
}
