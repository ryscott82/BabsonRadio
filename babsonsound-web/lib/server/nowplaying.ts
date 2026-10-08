import 'server-only'
import { adminDb } from './admin'
import { currentOnAir, getNote, type LiveNote } from './live'
import { listenerSample } from './taste'
import { getAnnouncement, type Announcement } from './announcement'

// Public "what is on air" feed for the website and the iOS app.
// Reads AzuraCast's public now-playing endpoint (no API key). Env: AZURACAST_URL, AZURACAST_STATION_ID.
// Cached for a few seconds so AzuraCast sees ~1 request per interval however many listeners there are.

export interface NowPlayingInfo {
  configured: boolean
  title: string; artist: string; album: string; art: string
  elapsed: number; duration: number
  isLive: boolean; streamer: string; listeners: number
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
  /** A message for the whole audience from the station controls, or null. */
  announcement: Announcement | null
  updatedAt: number
}

const TTL_MS = 8_000
let lastSample = 0
let cache: { at: number; value: Built } | null = null

type Built = Omit<NowPlayingInfo, 'announcement'>
const empty = (configured: boolean): Built => ({
  configured, title: '', artist: '', album: '', art: '', elapsed: 0, duration: 0,
  isLive: false, streamer: '', listeners: 0, next: null, showTitle: '', blockTitle: '', color: '',
  occId: '', isShow: false, showStart: 0, showEnd: 0, note: null, updatedAt: Date.now(),
})

type Song = { text?: string; artist?: string; title?: string; album?: string; art?: string }
type Raw = {
  now_playing?: { song?: Song; elapsed?: number; duration?: number }
  playing_next?: { song?: Song }
  live?: { is_live?: boolean; streamer_name?: string }
  listeners?: { current?: number; total?: number }
}

/** The scheduled thing on air right now (one-time event > student slot > weekly show > genre block). */
async function onAir(): Promise<Pick<NowPlayingInfo, 'showTitle' | 'blockTitle' | 'color' | 'occId' | 'isShow' | 'showStart' | 'showEnd' | 'note'>> {
  const none = { showTitle: '', blockTitle: '', color: '', occId: '', isShow: false, showStart: 0, showEnd: 0, note: null }
  try {
    const db = adminDb()
    const cur = await currentOnAir(db)
    if (!cur) return none
    return {
      showTitle: cur.isShow ? cur.item.title : '', blockTitle: cur.item.title, color: cur.item.color, occId: cur.occId, isShow: cur.isShow,
      showStart: cur.item.startAt, showEnd: cur.item.endAt, note: await getNote(db, cur.occId),
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
    const value: Built = {
      configured: true, title, artist, album: s.album ?? '', art: s.art ?? '',
      elapsed: r.now_playing?.elapsed ?? 0, duration: r.now_playing?.duration ?? 0,
      isLive: r.live?.is_live === true, streamer: r.live?.streamer_name ?? '',
      listeners: r.listeners?.current ?? 0,
      next: n && (n.title || n.text) ? { title: n.title || n.text || '', artist: n.artist ?? '' } : null,
      ...(await onAir()),
      updatedAt: Date.now(),
    }
    cache = { at: Date.now(), value }
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
