import { nyParts, nyToMs } from './slotAuto.ts'

// Strikes, pure. Detection only flags (status 'pending'); a person on the E-board confirms or excuses every strike.
// Two kinds are bans the E-board or BabsonARTS issue directly: 'ban-studio' (one week without the studio) and 'ban-semester' (no hosting or booking until the semester ends). They are not strikes and do not add to the count.
export const STRIKE_KINDS = ['live-no-show', 'prerecorded-no-show', 'late-cancel', 'studio-no-show', 'manual', 'ban-studio', 'ban-semester'] as const
export type StrikeKind = (typeof STRIKE_KINDS)[number]
export type StrikeStatus = 'pending' | 'confirmed' | 'excused' | 'expired'
export const BAN_LEVEL = 3
/** The second strike pauses the studio for this long (from the day it is confirmed). The third pauses everything until the semester ends. */
export const STUDIO_BAN_MS = 7 * 86_400_000
export const isBanKind = (kind: string) => kind === 'ban-studio' || kind === 'ban-semester'

export interface StrikeLike { kind: StrikeKind | string; status: StrikeStatus | string; at: number; expiresAt?: number | null; decidedAt?: number | null }

export const KIND_TEXT: Record<StrikeKind, string> = {
  'live-no-show': 'Missed a live show', 'prerecorded-no-show': 'No audio for a pre-recorded show', 'late-cancel': 'Cancelled a show late',
  'studio-no-show': 'Did not check in to a studio booking', manual: 'Added by staff', 'ban-studio': 'Studio ban for one week', 'ban-semester': 'Banned for the rest of the semester',
}

/** The last moment of the semester end date (a YYYY-MM-DD, New York time). */
export function semesterEndMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return nyToMs(y, m, d + 1, 0, 0) - 1
}

/** A strike counts while it is confirmed and has not expired. Pending, excused and expired ones never count. */
export const counts = (s: StrikeLike, now: number) => s.status === 'confirmed' && (s.expiresAt == null || s.expiresAt > now)

export const levelOf = (strikes: StrikeLike[], now: number) => strikes.filter(s => counts(s, now) && !isBanKind(s.kind)).length

/** When the full ban ends: three strikes (until the semester ends), or a semester ban given directly. null when there is no ban. */
export function bannedUntilOf(strikes: StrikeLike[], now: number): number | null {
  const live = strikes.filter(s => counts(s, now))
  const direct = live.filter(s => s.kind === 'ban-semester').map(s => s.expiresAt ?? 0).filter(Boolean)
  const strikesOnly = live.filter(s => !isBanKind(s.kind))
  const fromStrikes = strikesOnly.length >= BAN_LEVEL ? strikesOnly.map(s => s.expiresAt ?? 0).filter(Boolean) : []
  const ends = [...direct, ...fromStrikes]
  return ends.length ? Math.max(...ends) : null
}

/** When the studio ban ends: a week after the second strike was confirmed, or a week after a studio ban was issued. null when there is none running. */
export function studioBanUntilOf(strikes: StrikeLike[], now: number): number | null {
  const live = strikes.filter(s => counts(s, now)), when = (s: StrikeLike) => s.decidedAt ?? s.at
  const ends: number[] = []
  const strikesOnly = live.filter(s => !isBanKind(s.kind)).sort((a, b) => when(a) - when(b))
  if (strikesOnly.length >= 2) ends.push(when(strikesOnly[1]) + STUDIO_BAN_MS)
  for (const s of live) if (s.kind === 'ban-studio') ends.push(when(s) + STUDIO_BAN_MS)
  const latest = ends.length ? Math.max(...ends) : 0
  return latest > now ? latest : null
}

const dateText = (ms: number) => { const p = nyParts(ms); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m - 1]} ${p.d}, ${p.y}` }

export function standingOf(strikes: (StrikeLike & { note?: string })[], now: number) {
  const level = levelOf(strikes, now)
  const until = bannedUntilOf(strikes, now)
  const studioUntil = studioBanUntilOf(strikes, now)
  const banned = until != null || level >= BAN_LEVEL
  const label = banned ? `Banned until ${until ? dateText(until) : 'the end of the semester'}` : studioUntil ? `Studio ban until ${dateText(studioUntil)}` : level === 2 ? 'Second strike' : level === 1 ? 'First strike' : 'Good standing'
  return {
    level: Math.min(level, BAN_LEVEL), label, bannedUntil: until, studioBannedUntil: studioUntil,
    strikes: strikes.filter(s => counts(s, now)).sort((a, b) => a.at - b.at).map(s => ({ date: dateText(s.at), reason: KIND_TEXT[s.kind as StrikeKind] ?? 'Strike' })),
  }
}

/** Which email a person gets when a strike is confirmed (level after it counts). */
export const emailKindFor = (levelAfter: number): 'mistake' | 'warning' | 'ban' => (levelAfter >= BAN_LEVEL ? 'ban' : levelAfter === 2 ? 'warning' : 'mistake')

/** A ban the E-board or BabsonARTS give directly, and the email kind it sends. */
export const banEmailKind = (kind: string): 'studio-ban' | 'ban' => (kind === 'ban-studio' ? 'studio-ban' : 'ban')

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
