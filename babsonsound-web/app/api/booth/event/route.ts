import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { BYPASS_UID, cleanSig, songText, verifyAttest } from '@/lib/booth'
import { EVENT_KINDS, boothSecret, clearBoothSong, recordEvent, setBoothSong } from '@/lib/server/booth'
import { assertClean } from '@/lib/server/wordFilter'
import { refreshNowPlaying } from '@/lib/server/nowplaying'

export const runtime = 'nodejs'

// The studio PC page reports what happened: { sessionId, kind: live_start | live_stop | song | music | sign_out | idle_out | quiet_ack (they tapped OK on the quiet-hours notice) }.
// A song carries { title, artist } and is shown on the site and app while the show is live. Music (background music played
// from the station library while live) carries { title, artist } too, but is only logged, for the play log.
export async function POST(req: Request) {
  return handle(async () => {
    // No sign-in header: the studio PC itself (signed nonce) reporting on a "no sign-in" session. recordEvent only accepts the studio-pc session owner.
    let uid = BYPASS_UID
    if (req.headers.get('authorization')) uid = (await requireUser(req)).uid
    else if (!verifyAttest(boothSecret(), (req.headers.get('x-booth-nonce') ?? '').slice(0, 100), (req.headers.get('x-booth-sig') ?? '').slice(0, 100))) {
      throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')
    }
    const db = adminDb()
    const b = await readJson(req)
    const kind = str(b.kind, 20) as (typeof EVENT_KINDS)[number]
    if (!EVENT_KINDS.includes(kind)) throw new HttpError(400, 'Unknown event.')
    const sessionId = str(b.sessionId, 64)
    if (!sessionId) throw new HttpError(400, 'Missing session.')
    const title = str(b.title, 120), artist = str(b.artist, 120)
    if ((kind === 'song' || kind === 'music') && !title) throw new HttpError(400, 'Type the song title.')
    // A typed track title: checked against the word filter, then signed so the studio helper will put exactly this text on the stream.
    const text = kind === 'song' ? songText(b.text) || [artist, title].filter(Boolean).join(' - ') : ''
    if (kind === 'song') await assertClean(db, title, artist, text)
    await recordEvent(db, sessionId, uid, kind, kind === 'song' || kind === 'music' ? [artist, title].filter(Boolean).join(' - ') : kind === 'quiet_ack' ? 'quiet hours' : '')
    if (kind === 'music' || kind === 'quiet_ack') return { ok: true }
    if (kind === 'song') { await setBoothSong(db, sessionId, title, artist); after(() => refreshNowPlaying().catch(() => {})); return { ok: true, text, sig: cleanSig(boothSecret(), text) } }
    else if (kind !== 'live_start') await clearBoothSong(db, sessionId)
    if (kind !== 'live_start') after(() => refreshNowPlaying().catch(() => {}))
    return { ok: true }
  })
}
