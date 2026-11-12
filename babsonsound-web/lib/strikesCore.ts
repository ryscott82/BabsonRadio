import { nyParts, nyToMs } from './slotAuto.ts'

// Strikes, pure. Detection only flags (status 'pending'); a person on the E-board confirms or excuses every strike.
export const STRIKE_KINDS = ['live-no-show', 'prerecorded-no-show', 'late-cancel', 'studio-no-show', 'manual'] as const
export type StrikeKind = (typeof STRIKE_KINDS)[number]
export type StrikeStatus = 'pending' | 'confirmed' | 'excused' | 'expired'
export const BAN_LEVEL = 3

export interface StrikeLike { kind: StrikeKind | string; status: StrikeStatus | string; at: number; expiresAt?: number | null }

export const KIND_TEXT: Record<StrikeKind, string> = {
  'live-no-show': 'Missed a live show', 'prerecorded-no-show': 'No audio for a pre-recorded show', 'late-cancel': 'Cancelled a show late',
  'studio-no-show': 'Did not check in to a studio booking', manual: 'Added by the E-board',
}

/** The last moment of the semester end date (a YYYY-MM-DD, New York time). */
export function semesterEndMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return nyToMs(y, m, d + 1, 0, 0) - 1
}

/** A strike counts while it is confirmed and has not expired. Pending, excused and expired ones never count. */
export const counts = (s: StrikeLike, now: number) => s.status === 'confirmed' && (s.expiresAt == null || s.expiresAt > now)

export const levelOf = (strikes: StrikeLike[], now: number) => strikes.filter(s => counts(s, now)).length

/** When the ban ends: the latest expiry among the strikes that count (null when there is no ban). */
export function bannedUntilOf(strikes: StrikeLike[], now: number): number | null {
  const live = strikes.filter(s => counts(s, now))
  if (live.length < BAN_LEVEL) return null
  const ends = live.map(s => s.expiresAt ?? 0).filter(Boolean)
  return ends.length ? Math.max(...ends) : null
}

const dateText = (ms: number) => { const p = nyParts(ms); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m - 1]} ${p.d}, ${p.y}` }

export function standingOf(strikes: (StrikeLike & { note?: string })[], now: number) {
  const level = levelOf(strikes, now)
  const until = bannedUntilOf(strikes, now)
  const label = level >= BAN_LEVEL ? `Banned until ${until ? dateText(until) : 'the end of the semester'}` : level === 2 ? 'Warning' : level === 1 ? '1 mistake' : 'Good standing'
  return {
    level: Math.min(level, BAN_LEVEL), label, bannedUntil: until,
    strikes: strikes.filter(s => counts(s, now)).sort((a, b) => a.at - b.at).map(s => ({ date: dateText(s.at), reason: KIND_TEXT[s.kind as StrikeKind] ?? 'Strike' })),
  }
}

/** Which email a person gets when a strike is confirmed (level after it counts). */
export const emailKindFor = (levelAfter: number): 'mistake' | 'warning' | 'ban' => (levelAfter >= BAN_LEVEL ? 'ban' : levelAfter === 2 ? 'warning' : 'mistake')

/** A ban blocks new show requests and studio bookings until it ends. */
export const isBanned = (bannedUntil: unknown, now: number) => typeof bannedUntil === 'number' && bannedUntil > now

export const strikeId = (kind: StrikeKind, refId: string) => `${kind}_${refId}`.replace(/[/\s]/g, '_').slice(0, 140)

// ── detection (flags only) ─────────────────────────────────
/** A live show is flagged when nobody was connected during its slot. `signals` are the stretches somebody was live (the studio PC go-live log, or a streamer on the stream history). */
export function liveNoShow(slot: { startAt: number; endAt: number }, signals: { from: number; to: number }[], now: number, graceMs = 10 * 60_000): boolean {
  if (now < slot.endAt + graceMs) return false
  const a = slot.startAt - 30 * 60_000, b = slot.endAt + 30 * 60_000
  return !signals.some(s => s.from <= b && s.to >= a)
}
/** A pre-recorded show is flagged when it starts with no audio link and no recording attached. */
export function prerecordedNoAudio(i: { startAt: number; audioURL: string; recordingId: string }, now: number, graceMs = 5 * 60_000): boolean {
  return now >= i.startAt + graceMs && !i.audioURL && !i.recordingId
}
/** A show cancelled less than `hours` before it starts. */
export const isLateCancel = (startMs: number, cancelledAt: number, hours: number) => hours > 0 && startMs - cancelledAt < hours * 3_600_000 && startMs > cancelledAt
