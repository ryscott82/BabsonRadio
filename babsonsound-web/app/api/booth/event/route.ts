import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { EVENT_KINDS, clearBoothSong, recordEvent, setBoothSong } from '@/lib/server/booth'
import { refreshNowPlaying } from '@/lib/server/nowplaying'

export const runtime = 'nodejs'

// The studio PC page reports what happened: { sessionId, kind: live_start | live_stop | song | music | sign_out | idle_out | quiet_ack (they tapped OK on the quiet-hours notice) }.
// A song carries { title, artist } and is shown on the site and app while the show is live. Music (background music played
// from the station library while live) carries { title, artist } too, but is only logged, for the play log.
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
    if ((kind === 'song' || kind === 'music') && !title) throw new HttpError(400, 'Type the song title.')
    await recordEvent(db, sessionId, t.uid, kind, kind === 'song' || kind === 'music' ? [artist, title].filter(Boolean).join(' - ') : kind === 'quiet_ack' ? 'quiet hours' : '')
    if (kind === 'music' || kind === 'quiet_ack') return { ok: true }
    if (kind === 'song') await setBoothSong(db, sessionId, title, artist)
    else if (kind !== 'live_start') await clearBoothSong(db, sessionId)
    if (kind !== 'live_start') after(() => refreshNowPlaying().catch(() => {}))
    return { ok: true }
  })
}
