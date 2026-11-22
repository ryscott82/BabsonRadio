import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { BYPASS_UID, cleanSig, songText, verifyAttest } from '@/lib/booth'
import { EVENT_KINDS, boothSecret, clearBoothSong, logTimeline, recordEvent, setBoothGap, setBoothMode, setBoothSong, setBoothTrack } from '@/lib/server/booth'
import { assertClean } from '@/lib/server/wordFilter'
import { refreshNowPlaying } from '@/lib/server/nowplaying'
import { allowedArtUrl } from '@/lib/artProxy'
import { cleanMode } from '@/lib/trackLog'

export const runtime = 'nodejs'

// The studio PC page reports what happened: { sessionId, kind: live_start | live_stop | song | music | gap | mode | sign_out | idle_out | quiet_ack (they tapped OK on the quiet-hours notice) }.
// A song carries { title, artist } (typed by the host) and is shown on the site and app while the show is live.
// Music (a track the booth started from the station library) carries { title, artist, art, bed }: it is shown the same way (a small line
// for a talk show, large for a music show) and kept in the live log. gap = the music stopped. mode = { mode: 'talk' | 'music' }.
// The live log (boothTimeline) is what lets a recorded show show the same thing while it plays back.
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
    const mode = cleanMode(b.mode)
    if (kind === 'mode' && !mode) throw new HttpError(400, 'Choose Talk or Music.')
    // A typed track title: checked against the word filter, then signed so the studio helper will put exactly this text on the stream.
    const text = kind === 'song' ? songText(b.text) || [artist, title].filter(Boolean).join(' - ') : ''
    if (kind === 'song') await assertClean(db, title, artist, text)
    const detail = kind === 'song' || kind === 'music' ? [artist, title].filter(Boolean).join(' - ') : kind === 'quiet_ack' ? 'quiet hours' : kind === 'mode' ? mode : ''
    await recordEvent(db, sessionId, uid, kind, detail)
    const now = Date.now()
    // Only this station's own pictures are kept; anything else becomes "no picture".
    const art = allowedArtUrl(str(b.art, 400), process.env.AZURACAST_URL)?.toString() ?? ''
    const refresh = () => after(() => refreshNowPlaying().catch(() => {}))

    if (kind === 'quiet_ack') return { ok: true }
    if (kind === 'music') {
      const bed = b.bed === true
      await setBoothTrack(db, sessionId, { title, artist, art, bed }, now)
      await logTimeline(db, sessionId, uid, { at: now, kind: 'track', title, artist, art, bed })
      refresh()
      return { ok: true }
    }
    if (kind === 'gap') {
      await setBoothGap(db, sessionId, now)
      await logTimeline(db, sessionId, uid, { at: now, kind: 'gap' })
      refresh()
      return { ok: true }
    }
    if (kind === 'mode') {
      await setBoothMode(db, sessionId, mode as 'talk' | 'music', now)
      await logTimeline(db, sessionId, uid, { at: now, kind: 'mode', mode: mode as 'talk' | 'music' })
      refresh()
      return { ok: true }
    }
    if (kind === 'song') {
      await setBoothSong(db, sessionId, title, artist, now)
      await logTimeline(db, sessionId, uid, { at: now, kind: 'track', title, artist, art: '', bed: false })
      refresh()
      return { ok: true, text, sig: cleanSig(boothSecret(), text) }
    }
    if (kind !== 'live_start') await clearBoothSong(db, sessionId)
    if (kind !== 'live_start') refresh()
    return { ok: true }
  })
}
