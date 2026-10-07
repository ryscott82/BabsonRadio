import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { localParts, type AutoConfig } from '../autoschedule'

// Pushes the planned genre blocks into AzuraCast, one playlist per genre.
//
// Setup (Vercel env vars):
//   AZURACAST_URL         e.g. https://a12.asurahosting.com   (the panel's address, no trailing slash)
//   AZURACAST_API_KEY     "<id>:<secret>" from your AzuraCast profile → API Keys
//   AZURACAST_STATION_ID  station id or short name (default 1)
// In AzuraCast, create one playlist per genre, named exactly like the filler (or map names in the admin page).
// Station timezone in AzuraCast must match the scheduler's time zone.

export const azuraConfigured = () => !!(process.env.AZURACAST_URL && process.env.AZURACAST_API_KEY)

interface ScheduleItem {
  start_time: number; end_time: number; start_date: string; end_date: string; days: number[]; loop_once: boolean
}
interface Playlist { id: number; name: string; is_enabled?: boolean; schedule_items?: ScheduleItem[] }

async function az<T>(path: string, init?: RequestInit): Promise<T> {
  const base = (process.env.AZURACAST_URL ?? '').replace(/\/+$/, '')
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { 'X-API-Key': process.env.AZURACAST_API_KEY ?? '', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AzuraCast ${res.status} on ${path}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

const station = () => encodeURIComponent(process.env.AZURACAST_STATION_ID || '1')
const norm = (s: string) => s.trim().toLowerCase()

/** Station-local date "YYYY-MM-DD" and HHMM for a timestamp. */
function localDateTime(ms: number, tz: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  const { minutes } = localParts(ms, tz)
  return { date, hhmm: Math.floor(minutes / 60) * 100 + (minutes % 60) }
}

/** One planned block → one or two dated schedule items (split at local midnight). */
export function blockToItems(startMs: number, endMs: number, tz: string): ScheduleItem[] {
  const a = localDateTime(startMs, tz)
  const b = localDateTime(endMs - 1, tz) // last minute inside the block
  const item = (s: number, e: number, date: string): ScheduleItem =>
    ({ start_time: s, end_time: e, start_date: date, end_date: date, days: [], loop_once: false })
  const endHHMM = localDateTime(endMs, tz)
  if (a.date === b.date) {
    // A block ending exactly at midnight is written as ending 23:59 so AzuraCast doesn't read it as overnight.
    const e = endHHMM.date === a.date ? endHHMM.hhmm : 2359
    return [item(a.hhmm, e, a.date)]
  }
  return [item(a.hhmm, 2359, a.date), item(0, endHHMM.hhmm, b.date)]
}

export interface Status {
  configured: boolean
  ok: boolean
  error?: string
  playlists: { name: string; enabled: boolean }[]
  genres: { genre: string; playlist: string; found: boolean }[]
}

function genresOf(cfg: AutoConfig, extra: string[] = []): string[] {
  return [...new Set([...cfg.rules.flatMap(r => r.fillers), ...cfg.defaultFillers, ...extra])]
}

export async function azuraStatus(cfg: AutoConfig): Promise<Status> {
  if (!azuraConfigured()) return { configured: false, ok: false, playlists: [], genres: [] }
  try {
    const lists = await az<Playlist[]>(`/station/${station()}/playlists`)
    const byName = new Map(lists.map(p => [norm(p.name), p]))
    return {
      configured: true, ok: true,
      playlists: lists.map(p => ({ name: p.name, enabled: p.is_enabled !== false })),
      genres: genresOf(cfg).map(g => {
        const target = cfg.playlistMap[g] || g
        return { genre: g, playlist: target, found: byName.has(norm(target)) }
      }),
    }
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : String(e), playlists: [], genres: [] }
  }
}

export interface SyncResult { updated: { playlist: string; blocks: number }[]; missing: string[]; error?: string }

/** Replace the schedule of every genre playlist with the upcoming blocks from autoBlocks. */
export async function syncToAzuraCast(db: Firestore, cfg: AutoConfig, now = Date.now()): Promise<SyncResult> {
  if (!azuraConfigured()) return { updated: [], missing: [], error: 'AzuraCast is not set up (missing AZURACAST_URL / AZURACAST_API_KEY).' }
  try {
    const snap = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).get()
    const blocks = snap.docs.map(d => ({
      label: d.get('label') as string, startMs: d.get('startAt').toMillis() as number, endMs: d.get('endAt').toMillis() as number,
    }))
    const lists = await az<Playlist[]>(`/station/${station()}/playlists`)
    const byName = new Map(lists.map(p => [norm(p.name), p]))

    const genres = genresOf(cfg, blocks.map(b => b.label))
    const updated: SyncResult['updated'] = []
    const missing: string[] = []
    for (const genre of genres) {
      const target = cfg.playlistMap[genre] || genre
      const pl = byName.get(norm(target))
      if (!pl) { if (blocks.some(b => b.label === genre)) missing.push(target); continue }
      const mine = blocks.filter(b => b.label === genre)
      const items = mine.flatMap(b => blockToItems(b.startMs, b.endMs, cfg.timezone))
      await az(`/station/${station()}/playlist/${pl.id}`, {
        method: 'PUT', body: JSON.stringify({ is_enabled: true, schedule_items: items }),
      })
      updated.push({ playlist: pl.name, blocks: mine.length })
    }
    return { updated, missing }
  } catch (e) {
    return { updated: [], missing: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Live controls for the host panel ─────────────────────────────────────────

export interface NowPlaying {
  song: string; artist: string; title: string; elapsed: number; duration: number
  isLive: boolean; streamer: string; listeners: number
}

/** What is on air right now (public AzuraCast endpoint). */
export async function azNowPlaying(): Promise<NowPlaying | null> {
  if (!azuraConfigured()) return null
  type Raw = {
    now_playing?: { song?: { text?: string; artist?: string; title?: string }; elapsed?: number; duration?: number }
    live?: { is_live?: boolean; streamer_name?: string }
    listeners?: { current?: number }
  }
  const r = await az<Raw>(`/nowplaying/${station()}`)
  return {
    song: r.now_playing?.song?.text ?? '', artist: r.now_playing?.song?.artist ?? '', title: r.now_playing?.song?.title ?? '',
    elapsed: r.now_playing?.elapsed ?? 0, duration: r.now_playing?.duration ?? 0,
    isLive: r.live?.is_live === true, streamer: r.live?.streamer_name ?? '', listeners: r.listeners?.current ?? 0,
  }
}

/** Skip to the next song. The API key needs the "Manage station broadcasting" permission. */
export async function azSkip(): Promise<void> {
  if (!azuraConfigured()) throw new Error('AzuraCast is not configured')
  await az(`/station/${station()}/backend/skip`, { method: 'POST' })
}

/** Start/stop the broadcast engine (backend = AutoDJ, frontend = the stream server). Needs "Manage station broadcasting". */
export async function azControl(part: 'backend' | 'frontend', action: 'start' | 'stop' | 'restart'): Promise<void> {
  if (!azuraConfigured()) throw new Error('AzuraCast is not configured')
  await az(`/station/${station()}/${part}/${action}`, { method: 'POST' })
}
