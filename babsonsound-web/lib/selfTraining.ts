// Radio room training you take yourself (reached from the QR code on the studio door): watch the video, answer the quiz, sign the agreement.
// One training, one result: you are trained for the radio room or you are not (both the Studio and Radio badges are granted together).
// Pure rules (no server imports) so the route and the tests share them.

/** The quiz must be perfect (every question right). A failed attempt shows which ones were wrong and why, never the right answer. */
export const SELF_PASS_PERCENT = 100
/** Questions per attempt, drawn from the pool in lib/studioConfig.ts (a new draw for every attempt). */
export const SELF_QUESTIONS = 10
/** The quiz opens this long after the video was first opened (the video is about 6 minutes), so the video can't be skipped. */
export const SELF_MIN_WATCH_MS = 5 * 60_000
/** A perfect quiz lets you sign the agreement for this long. */
export const QUIZ_VALID_MS = 60 * 60_000
/** Time between quiz attempts, to read the explanations first. */
export const SELF_RETRY_MS = 20_000

/** A small seeded random generator (mulberry32) so the same person and attempt always get the same questions. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `count` different questions from the pool, in a shuffled order, the same for the same seed. */
export function drawQuestions<T>(pool: T[], count: number, seed: string): T[] {
  const r = rng(seed), a = [...pool]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, Math.min(count, a.length))
}

export type SelfGate = { ok: true } | { ok: false; status: number; code: string; message: string }

/** May this person submit the quiz now? `startedAt` is when they first opened the video (0 = never), `lastAttemptAt` their last try. */
export function selfQuizGate(i: { startedAt: number; lastAttemptAt: number; now: number }): SelfGate {
  if (!i.startedAt || i.now - i.startedAt < SELF_MIN_WATCH_MS) return { ok: false, status: 409, code: 'BR-STU-021', message: 'Watch the whole video first, then take the quiz.' }
  if (i.lastAttemptAt && i.now - i.lastAttemptAt < SELF_RETRY_MS) return { ok: false, status: 429, code: 'BR-STU-016', message: 'Take a moment to read the explanations before trying again.' }
  return { ok: true }
}

/** Seconds left before the quiz opens. */
export const watchLeftSec = (startedAt: number, now: number) => (startedAt ? Math.max(0, Math.ceil((startedAt + SELF_MIN_WATCH_MS - now) / 1000)) : Math.ceil(SELF_MIN_WATCH_MS / 1000))
