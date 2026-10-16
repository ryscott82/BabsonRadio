import 'server-only'
import { adminDb } from './admin'
import { currentOnAir, getColorChanging, getNote, type LiveNote } from './live'
import { listenerSample } from './taste'
import { getAnnouncement, type Announcement } from './announcement'
import { lookupBeat } from './beats'
import { trackActual } from './actualPlaylist'

// Public "what is on air" feed for the website and the iOS app.
// Reads AzuraCast's public now-playing endpoint (no API key). Env: AZURACAST_URL, AZURACAST_STATION_ID.
// Cached for a few seconds so AzuraCast sees ~1 request per interval however many listeners there are.

export interface NowPlayingInfo {
  configured: boolean
  title: string; artist: string; album: string; art: string
  elapsed: number; duration: number
  /** Unix seconds when this song started on the stream (0 if unknown). */
  playedAt: number
  /** The last few songs that played, newest first. */
  history: { title: string; artist: string; art: string; playedAt: number }[]
  /** Tempo of this song and where its first beat falls, in seconds, from the AzuraCast custom field "beat" (0 = not analyzed). */
  bpm: number; beatOffset: number
  isLive: boolean; streamer: string; listeners: number
  /** Name of the AzuraCast playlist the current song came from ('' when live or unknown). Staff only; listeners never see it. */
  playlist: string
  next: { title: string; artist: string } | null
  /** The scheduled show/event on air right now, and the color its scheduler picked ('' = default). */
  showTitle: string
  /** Name of whatever is scheduled now, including genre blocks ("Lofi Beats"). */
  blockTitle: string
  color: string
  /** The airing on right now (also for genre blocks), for reactions, ratings and votes. Empty when nothing is scheduled. */
  occId: string
  isShow: boolean
  showStart: number
  showEnd: number
  /** A message the host or staff pinned to this show, or null. */
  note: LiveNote | null
  /** True when the host/admin allows the night-time album-color background for what is on air. */
  colorChanging: boolean
  /** True when a scheduled show is on air and AzuraCast gives no track info, so title/artist are the show and host names instead. */
  showOnly: boolean
  /** A message for the whole audience from the station controls, or null. */
  announcement: Announcement | null
  updatedAt: number
}

/** Set to false to go back to labelling auto-play by the schedule instead of the AzuraCast playlist name. */
const USE_PLAYLIST_LABEL = true
const TTL_MS = 8_000
let lastSample = 0
let cache: { at: number; value: Built } | null = null

type Built = Omit<NowPlayingInfo, 'announcement'> & { showOnly: boolean; hostNames?: string[] }
const empty = (configured: boolean): Built => ({
  configured, title: '', artist: '', album: '', art: '', elapsed: 0, duration: 0, playedAt: 0, history: [], bpm: 0, beatOffset: 0,
  isLive: false, streamer: '', playlist: '', listeners: 0, next: null, showTitle: '', blockTitle: '', color: '',
  occId: '', isShow: false, showStart: 0, showEnd: 0, note: null, colorChanging: false, showOnly: false, updatedAt: Date.now(),
})

type Song = { text?: string; artist?: string; title?: string; album?: string; art?: string; custom_fields?: Record<string, unknown> | unknown[] }
type Raw = {
  now_playing?: { song?: Song; elapsed?: number; duration?: number; playlist?: string; played_at?: number }
  playing_next?: { song?: Song }
  live?: { is_live?: boolean; streamer_name?: string }
  listeners?: { current?: number; total?: number }
  song_history?: { played_at?: number; song?: Song }[]
}

/** The scheduled thing on air right now (one-time event > student slot > weekly show > genre block). */
async function onAir(): Promise<Pick<NowPlayingInfo, 'showTitle' | 'blockTitle' | 'color' | 'occId' | 'isShow' | 'showStart' | 'showEnd' | 'note' | 'colorChanging'> & { hostNames: string[] }> {
  const none = { showTitle: '', blockTitle: '', color: '', occId: '', isShow: false, showStart: 0, showEnd: 0, note: null, colorChanging: false, hostNames: [] as string[] }
  try {
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur) return none
    const [note, colorChanging] = await Promise.all([getNote(db, cur.occId), getColorChanging(db, cur)])
    return {
      showTitle: cur.isShow ? cur.item.title : '', blockTitle: cur.item.title, color: cur.item.color, occId: cur.occId, isShow: cur.isShow,
      showStart: cur.item.startAt, showEnd: cur.item.endAt, note, colorChanging, hostNames: cur.item.hosts ?? [],
    }
  } catch { return none }
}

export async function getNowPlaying(): Promise<NowPlayingInfo> {
  const base = await build()
  const announcement = await getAnnouncement(adminDb()).catch(() => null)
  return { ...base, announcement }
}

async function build(): Promise<Built> {
  const base = (process.env.AZURACAST_URL ?? '').replace(/\/+$/, '')
  if (!base) return empty(false)
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value

  const station = encodeURIComponent(process.env.AZURACAST_STATION_ID || '1')
  try {
    const res = await fetch(`${base}/api/nowplaying/${station}`, { signal: AbortSignal.timeout(6_000), cache: 'no-store' })
    if (!res.ok) throw new Error(`AzuraCast ${res.status}`)
    const r = (await res.json()) as Raw
    const s = r.now_playing?.song ?? {}
    const n = r.playing_next?.song
    // Some sources only send "Artist - Title" as one string.
    let title = s.title ?? '', artist = s.artist ?? ''
    if (!title && s.text) {
      const [a, ...t] = s.text.split(' - ')
      if (t.length) { artist = a; title = t.join(' - ') } else title = s.text
    }
    // "beat" custom field looks like "123.5,0.34" (BPM, first beat in seconds).
    const cf = s.custom_fields && !Array.isArray(s.custom_fields) ? s.custom_fields : {}
    const [bpmRaw, offRaw] = String(cf.beat ?? '').split(',')
    const known = lookupBeat(artist, title)
    const bpm = known ? known.bpm : Number(bpmRaw) >= 50 && Number(bpmRaw) <= 220 ? Number(bpmRaw) : 0
    const isLive = r.live?.is_live === true
    const playlist = r.now_playing?.playlist ?? ''
    const value: Built = {
      configured: true, title, artist, album: s.album ?? '', art: s.art ?? '',
      elapsed: r.now_playing?.elapsed ?? 0, duration: r.now_playing?.duration ?? 0,
      playedAt: r.now_playing?.played_at ?? 0,
      history: (r.song_history ?? []).filter(h => h.song && (h.song.title || h.song.text)).slice(0, 5)
        .map(h => ({ title: h.song!.title || h.song!.text || '', artist: h.song!.artist ?? '', art: h.song!.art ?? '', playedAt: h.played_at ?? 0 })),
      bpm, beatOffset: known ? known.offset : bpm ? Math.max(0, Number(offRaw) || 0) : 0,
      isLive, streamer: r.live?.streamer_name ?? '',
      playlist,
      listeners: r.listeners?.current ?? 0,
      next: n && (n.title || n.text) ? { title: n.title || n.text || '', artist: n.artist ?? '' } : null,
      ...(await onAir()), showOnly: false,
      updatedAt: Date.now(),
    }
    // A scheduled show that is not the auto DJ usually streams without track info. Show the show and host names instead
    // of a stale song (or a blank), and turn off the song-only extras (ratings, beat sync, "up next").
    if (value.isShow && (value.isLive || !value.title)) {
      value.title = value.showTitle || value.blockTitle
      value.artist = value.hostNames?.length ? value.hostNames.join(', ') : value.streamer
      value.album = ''; value.art = ''; value.bpm = 0; value.beatOffset = 0; value.duration = 0; value.elapsed = 0; value.next = null
      value.showOnly = true
    }
    // When the schedule has only a genre block (not a show) and the station is on auto-play, what is really playing wins:
    // use the AzuraCast playlist name so the label never disagrees with the music.
    if (!value.isLive && !value.isShow && playlist && USE_PLAYLIST_LABEL) value.blockTitle = playlist
    cache = { at: Date.now(), value }
    // Voting for the next hour closes 10 minutes before it; this makes sure it is decided on time even if no one has the vote card open.
    void import('./votes').then(m => m.finalizeDue(adminDb())).catch(() => {})
    // If AzuraCast is playing a different playlist than the plan, the schedule follows what is really on air.
    await trackActual(adminDb(), { playlist, playedAt: value.playedAt, isLive, isShow: value.isShow }).catch(() => {})
    // Remember how many people listen to what (once every 5 minutes) so the auto-scheduler can learn.
    if (Date.now() - lastSample > 300_000) {
      lastSample = Date.now()
      const label = value.blockTitle
      if (label) void listenerSample(adminDb(), { listeners: value.listeners, label, isShow: value.isShow, occId: value.occId }).catch(() => {})
    }
    return value
  } catch {
    // Keep showing the last good answer for a while instead of blanking the player.
    if (cache && Date.now() - cache.at < 60_000) return cache.value
    return empty(true)
  }
}
