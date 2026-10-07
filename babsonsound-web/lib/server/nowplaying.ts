import 'server-only'
import { adminDb } from './admin'
import { buildScheduleFeed } from './scheduleFeed'

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
  color: string
  updatedAt: number
}

const TTL_MS = 8_000
let cache: { at: number; value: NowPlayingInfo } | null = null

const empty = (configured: boolean): NowPlayingInfo => ({
  configured, title: '', artist: '', album: '', art: '', elapsed: 0, duration: 0,
  isLive: false, streamer: '', listeners: 0, next: null, showTitle: '', color: '', updatedAt: Date.now(),
})

type Song = { text?: string; artist?: string; title?: string; album?: string; art?: string }
type Raw = {
  now_playing?: { song?: Song; elapsed?: number; duration?: number }
  playing_next?: { song?: Song }
  live?: { is_live?: boolean; streamer_name?: string }
  listeners?: { current?: number; total?: number }
}

const RANK = { event: 0, slot: 1, weekly: 2, auto: 3 } as const

/** The scheduled thing on air right now (one-time event > student slot > weekly show > genre block). */
async function onAir(): Promise<{ showTitle: string; color: string }> {
  try {
    const now = Date.now()
    const items = (await buildScheduleFeed(adminDb(), { days: 1, showStudentHosts: false, now }))
      .filter(i => i.startAt <= now && i.endAt > now)
      .sort((a, b) => RANK[a.source] - RANK[b.source])
    const top = items[0]
    return top ? { showTitle: top.source === 'auto' ? '' : top.title, color: top.color } : { showTitle: '', color: '' }
  } catch { return { showTitle: '', color: '' } }
}

export async function getNowPlaying(): Promise<NowPlayingInfo> {
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
    const value: NowPlayingInfo = {
      configured: true, title, artist, album: s.album ?? '', art: s.art ?? '',
      elapsed: r.now_playing?.elapsed ?? 0, duration: r.now_playing?.duration ?? 0,
      isLive: r.live?.is_live === true, streamer: r.live?.streamer_name ?? '',
      listeners: r.listeners?.current ?? 0,
      next: n && (n.title || n.text) ? { title: n.title || n.text || '', artist: n.artist ?? '' } : null,
      ...(await onAir()),
      updatedAt: Date.now(),
    }
    cache = { at: Date.now(), value }
    return value
  } catch {
    // Keep showing the last good answer for a while instead of blanking the player.
    if (cache && Date.now() - cache.at < 60_000) return cache.value
    return empty(true)
  }
}
