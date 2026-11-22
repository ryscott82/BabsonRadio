// What was playing during a live show, and in which mode, kept so a recorded show can show the same thing while it plays back.
// Pure functions (no Firebase, no browser) so the tests cover them.
//
// Mode: "talk" = a talk show, any music is background (listeners get a small now-playing line). "music" = a music show, the song is the
// star (listeners get the cover, title and artist large, with the show name on top). The booth starts it from the show's category and the
// host can flip it at any time.

export type LiveMode = 'talk' | 'music'

/** What listeners see for a track played from the booth. art is a picture on this station's AzuraCast host or '' (checked on the server). */
export interface BoothTrack { title: string; artist: string; art: string; bed: boolean }

/** One row of the live log, written when it happened (at = ms since 1970). 'gap' means the music stopped. */
export interface LogRow { at: number; kind: 'track' | 'gap' | 'mode'; mode?: LiveMode; title?: string; artist?: string; art?: string; bed?: boolean }

/** A track on the recording's own clock: s and e are seconds from the start of the recording. */
export interface TimelineTrack extends BoothTrack { s: number; e: number }
export interface TimelineMode { s: number; mode: LiveMode }
export interface Timeline { modes: TimelineMode[]; tracks: TimelineTrack[] }

export const MAX_TIMELINE_TRACKS = 400
const MIN_TRACK_SEC = 1

export const cleanMode = (v: unknown): LiveMode | '' => (v === 'music' || v === 'talk' ? v : '')

/** A show in the Music category starts in music mode; every other show starts as a talk show. */
export const defaultMode = (category: unknown): LiveMode => (String(category ?? '').trim().toLowerCase() === 'music' ? 'music' : 'talk')

const text = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)

/**
 * Turns the live log into a timeline for the recording that started at startedAt and ended at endedAt.
 * The mode at the start is initialMode unless a mode row says otherwise before the first second. A track ends when the next track or a gap
 * starts (a crossfade counts as the new track starting), or when the show ends. Tracks shorter than a second are dropped.
 */
export function buildTimeline(rows: LogRow[], startedAt: number, endedAt: number, initialMode: LiveMode): Timeline {
  const total = Math.max(0, Math.round((endedAt - startedAt) / 1000))
  const at = (ms: number) => Math.min(total, Math.max(0, Math.round((ms - startedAt) / 1000)))
  const sorted = rows.filter(r => Number.isFinite(r.at) && r.at <= endedAt + 5_000).sort((a, b) => a.at - b.at)

  const modes: TimelineMode[] = [{ s: 0, mode: initialMode }]
  for (const r of sorted) {
    if (r.kind !== 'mode') continue
    const m = cleanMode(r.mode)
    if (!m) continue
    const s = at(r.at), last = modes[modes.length - 1]
    if (m === last.mode) continue
    if (s === last.s) last.mode = m // two changes in the same second: the later one wins
    else modes.push({ s, mode: m })
  }

  const tracks: TimelineTrack[] = []
  let open: TimelineTrack | null = null
  const close = (s: number) => {
    if (!open) return
    open.e = Math.max(open.s, s)
    if (open.e - open.s >= MIN_TRACK_SEC) tracks.push(open)
    open = null
  }
  for (const r of sorted) {
    if (r.kind === 'track') {
      const title = text(r.title, 120)
      if (!title) continue
      const s = at(r.at)
      close(s)
      open = { s, e: total, title, artist: text(r.artist, 120), art: text(r.art, 400), bed: r.bed === true }
    } else if (r.kind === 'gap') close(at(r.at))
  }
  close(total)
  // Merge the same mode repeating after a same-second collapse, and keep the list a sane size.
  return { modes: modes.filter((m, i) => i === 0 || m.mode !== modes[i - 1].mode), tracks: tracks.slice(0, MAX_TIMELINE_TRACKS) }
}

/** The mode at a time in the recording. */
export function modeAt(tl: Timeline | null | undefined, t: number): LiveMode {
  const list = tl?.modes ?? []
  let mode: LiveMode = list[0]?.mode ?? 'talk'
  for (const m of list) { if (m.s <= t) mode = m.mode; else break }
  return mode
}

/** The track playing at a time in the recording, or null between songs. The latest one that started wins during a crossfade. */
export function trackAt(tl: Timeline | null | undefined, t: number): TimelineTrack | null {
  let hit: TimelineTrack | null = null
  for (const k of tl?.tracks ?? []) { if (k.s <= t && t < k.e) hit = k; else if (k.s > t) break }
  return hit
}

/** Reads a timeline back from the database or from the API, ignoring anything malformed. null when there is nothing to show. */
export function readTimeline(v: unknown): Timeline | null {
  if (!v || typeof v !== 'object') return null
  const o = v as { modes?: unknown; tracks?: unknown }
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0)
  const modes: TimelineMode[] = (Array.isArray(o.modes) ? o.modes : []).flatMap(m => {
    const mm = m as { s?: unknown; mode?: unknown }
    const mode = cleanMode(mm?.mode)
    return mode ? [{ s: num(mm.s), mode }] : []
  }).sort((a, b) => a.s - b.s)
  const tracks: TimelineTrack[] = (Array.isArray(o.tracks) ? o.tracks : []).flatMap(k => {
    const kk = k as Partial<TimelineTrack>
    const title = text(kk?.title, 120)
    if (!title) return []
    const s = num(kk.s), e = num(kk.e)
    return e > s ? [{ s, e, title, artist: text(kk.artist, 120), art: text(kk.art, 400), bed: kk.bed === true }] : []
  }).sort((a, b) => a.s - b.s).slice(0, MAX_TIMELINE_TRACKS)
  return tracks.length || modes.some(m => m.mode === 'music') ? { modes: modes.length ? modes : [{ s: 0, mode: 'talk' }], tracks } : null
}

/**
 * When the audio file really starts, in ms. BUTT begins writing the file a few seconds after the booth says "go live", and the file
 * stops when the show stops, so counting back from the end with the file's own length lines the log up with the audio. If the file is
 * not a bit shorter than the on-air time (or is much shorter, e.g. BUTT was restarted mid-show), the on-air start is used.
 */
export function recordingStart(startedAt: number, endedAt: number, durationSec: number): number {
  const lag = (endedAt - startedAt) / 1000 - durationSec
  return durationSec > 0 && lag >= 0 && lag <= 120 ? endedAt - durationSec * 1000 : startedAt
}
