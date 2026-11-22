// The booth's song queue and crossfade, as plain functions so the tests cover them without audio.

export const XFADE_STEPS = [0, 2, 4, 6, 8, 12] as const
export const DEFAULT_XFADE = 4
export const MAX_QUEUE = 40

/** The next crossfade length in the cycle (0 = off). Anything unknown goes back to the default. */
export function nextXfade(cur: number): number {
  const i = (XFADE_STEPS as readonly number[]).indexOf(cur)
  return i < 0 ? DEFAULT_XFADE : XFADE_STEPS[(i + 1) % XFADE_STEPS.length]
}

/** A saved length is only used if it is one of the steps. */
export const cleanXfade = (v: unknown): number => (v === null || v === undefined || v === '' ? DEFAULT_XFADE : (XFADE_STEPS as readonly number[]).includes(Number(v)) ? Number(v) : DEFAULT_XFADE)

/** How many seconds before the end the next song should start: the crossfade, but never more than a third of a short song. 0 = start when it ends. */
export function leadSeconds(durationSec: number, xfade: number): number {
  if (!(durationSec > 0) || !(xfade > 0)) return 0
  return Math.min(xfade, durationSec / 3)
}

/** Equal-power crossfade: at progress k (0 to 1) the old song is at out and the new one at in, so the total loudness stays level. */
export function fadeGains(k: number): { out: number; in: number } {
  const x = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0))
  return { out: Math.cos(x * Math.PI / 2), in: Math.sin(x * Math.PI / 2) }
}

export interface Queueable { id: string; bed: boolean }

/**
 * What a tap on a song does. Nothing playing, or only a bed (looping background music): play it now. A song is playing: add it to the
 * queue. A double tap always plays it now. Beds always play now (they loop, so they would never reach the next song in a queue).
 */
export function tapAction(playing: Queueable | null, t: Queueable, doubleTap = false): 'play' | 'queue' {
  if (doubleTap || t.bed || !playing || playing.bed) return 'play'
  return 'queue'
}

/** A queue with the song added at the end (the same song may be queued twice; the queue is capped). */
export const enqueue = <T>(q: readonly T[], t: T, max = MAX_QUEUE): T[] => (q.length >= max ? [...q] : [...q, t])
export const removeAt = <T>(q: readonly T[], i: number): T[] => q.filter((_, j) => j !== i)
export const moveToFront = <T>(q: readonly T[], i: number): T[] => (i <= 0 || i >= q.length ? [...q] : [q[i], ...q.filter((_, j) => j !== i)])

/** Seconds left in the queue, for the "queued: 12:40" line. */
export const queueSeconds = (q: readonly { length: number }[]) => q.reduce((n, t) => n + (Number(t.length) || 0), 0)
