// Pure helpers for the episode player and the shared episode links, so the tests can cover them without a browser.

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75] as const
export const BACK_SEC = 15
export const FORWARD_SEC = 30

/** The next speed in the cycle (1x, 1.25x, 1.5x, 1.75x, 2x, 0.75x, then back to 1x). Anything unknown starts over at 1x. */
export const nextSpeed = (cur: number) => SPEEDS[(SPEEDS.indexOf(cur as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1
export const speedLabel = (s: number) => `${s}x`

/** 3725 -> "1:02:05", 75 -> "1:15", bad input -> "0:00". */
export function fmtTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** Where a link says to start: ?t=83, ?t=83s, ?t=1m23s or ?t=1h2m3s. 0 for anything else. */
export function parseStart(t: string | null | undefined): number {
  if (!t) return 0
  const s = t.trim().toLowerCase()
  if (/^\d{1,6}s?$/.test(s)) return parseInt(s, 10)
  const m = s.match(/^(?:(\d{1,3})h)?(?:(\d{1,3})m)?(?:(\d{1,3})s)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return 0
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0)
}

/** Keeps a time inside the episode. Without a known length it only stops negatives. */
export const clampTime = (t: number, duration: number) => {
  const x = Number.isFinite(t) ? Math.max(0, t) : 0
  return duration > 0 ? Math.min(x, Math.max(0, duration - 1)) : x
}

/** The page address for one episode, optionally starting at a time. Whole seconds only. */
export function episodeLink(origin: string, id: string, startSec = 0): string {
  const base = `${origin.replace(/\/+$/, '')}/episode/${encodeURIComponent(id)}`
  const t = Math.floor(startSec)
  return t > 0 ? `${base}?t=${t}` : base
}

/** Only ids made the way the site makes them. */
export const isEpisodeId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id)

export const positionKey = (id: string) => `ep.pos.${id}`

/** A saved position is only worth resuming when it is past the first few seconds and not near the end. */
export function resumeAt(saved: number, duration: number): number {
  if (!Number.isFinite(saved) || saved < 5) return 0
  if (duration > 0 && saved > duration - 10) return 0
  return Math.floor(saved)
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export interface SetlistDoc { showTitle: string; startAt: number; songs: string }

/** The set list a host entered for this episode's show: same title (or show name), aired within 12 hours of the episode. Closest wins. */
export function matchSetlist(docs: SetlistDoc[], names: string[], publishedAt: number): string[] {
  const want = new Set(names.map(norm).filter(Boolean))
  if (!want.size || !publishedAt) return []
  const hits = docs.filter(d => want.has(norm(d.showTitle)) && Math.abs(d.startAt - publishedAt) <= 12 * 3_600_000)
    .sort((a, b) => Math.abs(a.startAt - publishedAt) - Math.abs(b.startAt - publishedAt))
  return (hits[0]?.songs ?? '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 300)
}

/** The picture-and-text a shared link shows in Messages and Slack. Only ever built for public episodes. */
export function shareDescription(e: { showName: string; contributors?: string[]; description: string }): string {
  const who = e.contributors?.length ? `With ${e.contributors.slice(0, 4).join(', ')}. ` : ''
  return `${e.showName ? `${e.showName} on Babson Radio. ` : 'On Babson Radio. '}${who}${e.description}`.trim().slice(0, 200)
}
