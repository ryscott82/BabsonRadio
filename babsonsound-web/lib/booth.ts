import { createHmac, timingSafeEqual } from 'node:crypto'

// Studio PC ("booth"): the kiosk page on babsonradio.com talks to a small helper on the studio PC (tools/studio-helper),
// which drives BUTT. Both sides share STUDIO_PC_SECRET. Two things are signed with it:
//  - attest: the helper signs a fresh nonce, so the server knows a sign-in really happened on the studio PC.
//  - control token: the server signs a short-lived token for whoever is signed in on the studio PC; the helper only obeys
//    requests that carry one. Going live and sending songs need l=true; ending the stream works with any valid token. The helper repeats this exact format in plain JS (tools/studio-helper/helper.mjs).

export const BOOTH_HELPER_PORT = 7781
export const BOOTH_HELPER_ORIGIN = `http://127.0.0.1:${BOOTH_HELPER_PORT}`
export const TOKEN_TTL_MS = 15 * 60_000
export const NONCE_MAX_AGE_MS = 2 * 60_000
/** Hosts can go live from this long before their show starts until this long after it ends. */
export const LIVE_EARLY_MS = 30 * 60_000
export const LIVE_LATE_MS = 30 * 60_000

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const mac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest()
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

/** u: uid, n: name, s: studio session id, l: may go live (false = may only end the stream), r: may use Record a show (Studio badge), exp: ms. */
export interface BoothClaims { u: string; n: string; s: string; l: boolean; r?: boolean; exp: number }

export function signToken(secret: string, c: BoothClaims): string {
  const body = b64(JSON.stringify(c))
  return `${body}.${b64(mac(secret, `ctl:${body}`))}`
}

export function verifyToken(secret: string, token: string, now = Date.now()): BoothClaims | null {
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  if (!same(Buffer.from(sig, 'base64url'), mac(secret, `ctl:${body}`))) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as BoothClaims
    return typeof c.exp === 'number' && c.exp > now && typeof c.u === 'string' ? c : null
  } catch { return null }
}

/** The claims of a token this site signed, even an expired one (the caller decides how old is too old). */
export function readToken(secret: string, token: string): BoothClaims | null {
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  if (!same(Buffer.from(sig, 'base64url'), mac(secret, `ctl:${body}`))) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as BoothClaims
    return typeof c.exp === 'number' && typeof c.u === 'string' ? c : null
  } catch { return null }
}
/** A recording made on the studio PC can reach this site up to this long after its token ran out (the PC keeps retrying while the site is down). */
export const RECORDING_TOKEN_MAX_AGE_MS = 14 * 86_400_000

/** Nonce made by the page: "<ms>.<random>". */
export const attestSig = (secret: string, nonce: string) => mac(secret, `attest:${nonce}`).toString('hex')

export function verifyAttest(secret: string, nonce: string, sig: string, now = Date.now()): boolean {
  const m = /^(\d{12,14})\.[A-Za-z0-9]{8,64}$/.exec(nonce)
  if (!m || Math.abs(now - Number(m[1])) > NONCE_MAX_AGE_MS) return false
  if (!/^[0-9a-f]{64}$/.test(sig)) return false
  return same(Buffer.from(sig, 'hex'), Buffer.from(attestSig(secret, nonce), 'hex'))
}

export const liveWindowOpen = (s: { startAt: number; endAt: number }, now: number) =>
  now >= s.startAt - LIVE_EARLY_MS && now <= s.endAt + LIVE_LATE_MS

// ── Level meter targets ──────────────────────────────────────
/** The station's music is normalized to -14 LUFS (tools/normalize_loudness.py), so live shows aim for the same. */
export const TARGET_LUFS = -14
export const GOOD_LUFS: [number, number] = [-17, -11]
/** Too loud is judged fast, on the short-term (3 s) value. */
export const LOUD_LUFS = -9
/** Too quiet is judged slowly, on the gated 30 s loudness: it must stay below QUIET_LUFS for QUIET_HOLD_MS, and it clears
 *  only once it is back above QUIET_CLEAR_LUFS (hysteresis, so it never flips near the limit). Healthy speech sits above -23. */
export const QUIET_LUFS = -23
export const QUIET_CLEAR_LUFS = -21
export const LONG_WINDOW_MS = 30_000
export const QUIET_HOLD_MS = 60_000
/** No "Too quiet" this long after going live, after a track change, or when the meter starts (the 30 s window is still filling). */
export const QUIET_WARMUP_MS = 30_000
/** BS.1770 gating: blocks below -70 LUFS are ignored, then blocks more than 10 LU under the running average. */
export const ABS_GATE_LUFS = -70
export const REL_GATE_LU = 10
/** Peak level (dBFS) treated as clipping, and below which the input counts as silent. */
export const CLIP_DBFS = -0.5
export const SILENT_DBFS = -55

export type LevelState = 'off' | 'silent' | 'quiet' | 'good' | 'loud' | 'clip'

/** One word for the host. Silent, clipping and too loud answer quickly (peak, last 2 s of clipping, short-term loudness).
 *  `quiet` comes from the slow tracker below (stepQuiet), never from the short-term value. */
export function levelState(shortLufs: number, peakDb: number, clippedRecently: boolean, quiet = false): LevelState {
  if (!Number.isFinite(peakDb) || peakDb < SILENT_DBFS) return 'silent'
  if (clippedRecently) return 'clip'
  if (shortLufs > LOUD_LUFS) return 'loud'
  if (quiet) return 'quiet'
  return 'good'
}

/** BS.1770 loudness from a mean square of K-weighted samples. */
export const lufsOf = (meanSquare: number) => (meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity)

/** Gated loudness over a window of 400 ms block mean squares (BS.1770-style): drops blocks under -70 LUFS, then blocks more than
 *  10 LU under the average of what is left, so silent gaps and quiet passages do not drag the average down. -Infinity if nothing is left. */
export function gatedLufs(blocks: number[]): number {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const loud = blocks.filter(b => lufsOf(b) > ABS_GATE_LUFS)
  if (!loud.length) return -Infinity
  const floor = lufsOf(mean(loud)) - REL_GATE_LU
  const kept = loud.filter(b => lufsOf(b) > floor)
  return kept.length ? lufsOf(mean(kept)) : -Infinity
}

/** The slow "Too quiet" decision. `belowSince` is when the long average first dropped under QUIET_LUFS; `warmFrom` is when the
 *  warm-up started (going live, a track change, or the meter starting). */
export interface QuietTracker { belowSince: number | null; quiet: boolean; warmFrom: number }
export const newQuietTracker = (now: number): QuietTracker => ({ belowSince: null, quiet: false, warmFrom: now })

/** Advance the tracker. `longLufs` is the gated 30 s loudness (with BUTT's gain added). Pass restart on going live or a new track. */
export function stepQuiet(t: QuietTracker, now: number, longLufs: number, restart = false): QuietTracker {
  if (restart) return newQuietTracker(now)
  if (now - t.warmFrom < QUIET_WARMUP_MS) return { ...t, belowSince: null, quiet: false }
  if (t.quiet) return longLufs > QUIET_CLEAR_LUFS ? { ...t, belowSince: null, quiet: false } : t
  if (!Number.isFinite(longLufs) || longLufs >= QUIET_LUFS) return t.belowSince === null ? t : { ...t, belowSince: null }
  const since = t.belowSince ?? now
  return { ...t, belowSince: since, quiet: now - since >= QUIET_HOLD_MS }
}
export const dbOf = (amp: number) => (amp > 0 ? 20 * Math.log10(amp) : -Infinity)

// ── Ad breaks ───────────────────────────────────────────────
/** Station-wide ad break times (minutes past every hour) and how long each lasts. Set in Settings → Studio PC log. */
export interface AdPlan { enabled: boolean; minutes: number[]; lengthSec: number }
export const DEFAULT_ADS: AdPlan = { enabled: false, minutes: [20, 50], lengthSec: 120 }

export function cleanAdPlan(v: unknown): AdPlan {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<AdPlan>
  const minutes = [...new Set((Array.isArray(o.minutes) ? o.minutes : DEFAULT_ADS.minutes)
    .map(Number).filter(m => Number.isInteger(m) && m >= 0 && m <= 59))].sort((a, b) => a - b).slice(0, 12)
  const len = Math.round(Number(o.lengthSec))
  return { enabled: o.enabled === true, minutes, lengthSec: Number.isFinite(len) && len >= 15 && len <= 900 ? len : DEFAULT_ADS.lengthSec }
}

/** The ad break that is on now, or the next one, by the studio PC's own clock. */
export function adBreak(plan: AdPlan, now: number): { start: number; end: number; now: boolean } | null {
  if (!plan.enabled || !plan.minutes.length) return null
  const hour = new Date(now); hour.setMinutes(0, 0, 0)
  const len = plan.lengthSec * 1000
  for (let h = -1; h <= 1; h++) {
    for (const m of plan.minutes) {
      const start = hour.getTime() + h * 3_600_000 + m * 60_000
      if (now < start + len) return { start, end: start + len, now: now >= start }
    }
  }
  return null
}

// ── Auto level ──────────────────────────────────────────────
// The meter hears the mixer before BUTT, so what goes out is (input + BUTT gain). Each second the page nudges BUTT's gain
// toward the target: slowly (no pumping), only while there is sound (pauses don't push it up), and down fast on clipping.
export const AUTO_GAIN_RANGE: [number, number] = [-12, 12]
const STEP_UP_DB = 0.5, STEP_DOWN_DB = 1, DEADBAND_DB = 1, CLIP_DROP_DB = 3, SOUND_LUFS = -40

export function nextGain(gainDb: number, shortLufs: number, momentaryLufs: number, clipped: boolean): number {
  const clamp = (v: number) => Math.max(AUTO_GAIN_RANGE[0], Math.min(AUTO_GAIN_RANGE[1], v))
  if (clipped) return clamp(gainDb - CLIP_DROP_DB)
  if (!Number.isFinite(shortLufs) || !Number.isFinite(momentaryLufs) || momentaryLufs < SOUND_LUFS) return gainDb
  const out = shortLufs + gainDb
  const err = TARGET_LUFS - out
  if (Math.abs(err) <= DEADBAND_DB) return gainDb
  return clamp(gainDb + (err > 0 ? Math.min(err, STEP_UP_DB) : Math.max(err, -STEP_DOWN_DB)))
}

// ── Quiet hours and bookings on the booth page ──────────────
export const QUIET_BANNER = 'Quiet hours: keep the volume as low as possible. No loud DJ sets.'
export const QUIET_SOON_MS = 15 * 60_000
export const BOOKING_SOON_MS = 90 * 60_000

/** What /api/booth/studio-status says (only the parts the page uses). */
export interface StudioStatus {
  quiet: boolean; quietUntil: number | null; quietStartsAt: number | null
  bookings: { id: string; startAt: number; endAt: number; name: string }[]
}

/** The quiet-hours banner at `now`, from a status that may be a few minutes old. Warning only: it never blocks anything.
 *  'on' while quiet (until = when it ends, if known); 'soon' from 15 minutes before quiet hours start (inMs counts down). */
export function quietBanner(st: Pick<StudioStatus, 'quiet' | 'quietUntil' | 'quietStartsAt'> | null, now: number):
  { kind: 'on'; until: number | null } | { kind: 'soon'; inMs: number; startsAt: number } | null {
  if (!st) return null
  if (st.quiet && (st.quietUntil === null || now < st.quietUntil)) return { kind: 'on', until: st.quietUntil }
  const s = st.quietStartsAt
  if (s === null || !Number.isFinite(s)) return null
  if (now >= s) return { kind: 'on', until: null }
  if (s - now <= QUIET_SOON_MS) return { kind: 'soon', inMs: s - now, startsAt: s }
  return null
}

/** The booking lines under the welcome: "Booked now by <name>" (only when the signed-in person is not the booker) and
 *  "Next booking: <time>, <name>" when one starts within 90 minutes. Walk-ins always work: these are information only. */
export function bookingLines(st: Pick<StudioStatus, 'bookings'> | null, myBookingId: string, now: number, time: (ms: number) => string): string[] {
  if (!st?.bookings?.length) return []
  const out: string[] = []
  const cur = st.bookings.find(b => b.startAt <= now && now < b.endAt)
  if (cur && cur.id !== myBookingId) out.push(`Booked now by ${cur.name}`)
  const next = st.bookings.filter(b => b.startAt > now).sort((a, b) => a.startAt - b.startAt)[0]
  if (next && next.startAt - now <= BOOKING_SOON_MS && next.id !== myBookingId) out.push(`Next booking: ${time(next.startAt)}, ${next.name}`)
  return out
}

// ── Day / night on the booth panel ──────────────────────────
/** Night is 7 pm to 7 am. A host can force day or night from the panel; the choice lasts until the next automatic switch. */
export const NIGHT_FROM_HOUR = 19
export const NIGHT_TO_HOUR = 7
export const isNightAt = (ms: number) => { const h = new Date(ms).getHours(); return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR }
/** The next 7 am or 7 pm (local time) after `ms`. */
export function nextThemeSwitch(ms: number): number {
  const d = new Date(ms)
  for (const h of [NIGHT_TO_HOUR, NIGHT_FROM_HOUR]) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0).getTime()
    if (t > ms) return t
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, NIGHT_TO_HOUR, 0, 0, 0).getTime()
}
/** Night or day right now: a forced choice wins until it runs out, otherwise the clock decides. */
export function themeNow(ms: number, force: { night: boolean; until: number } | null): boolean {
  return force && ms < force.until ? force.night : isNightAt(ms)
}

// ── Booth without an account ────────────────────────────────
/** Names the studio PC uses for sessions that have no signed-in person. */
export const BYPASS_UID = 'studio-pc'
/** Constant-time PIN check (the emergency PIN lives in BOOTH_EMERGENCY_PIN on the server). */
export function pinMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected), b = Buffer.from(given)
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

// ── Open floor: going live without a booked show ───────────
/** When no scheduled show is on air, a trained host who has gone live from the studio before may go live without booking one. */
export const canGoLiveOpenFloor = (o: { radio: boolean; hostedBefore: boolean; showRunning: boolean }) => o.radio && o.hostedBefore && !o.showRunning

// ── Audio on the idle screen ────────────────────────────────
/** The idle screen opens the booth by itself when the mixer feed carries sound (peak above this) for MIXING_HOLD_MS. */
export const MIXING_PEAK_DBFS = -45
export const MIXING_HOLD_MS = 3_000
/** After someone leaves the booth, audio does not reopen it for this long. */
export const MIXING_SNOOZE_MS = 5 * 60_000

// ── Quiet-hours reminder ────────────────────────────────────
/** The small "Reminder: Quiet Hours are in Effect" notice comes back this long after it was dismissed. */
export const QUIET_REMIND_MS = 30 * 60_000
export const quietReminderDue = (dismissedAt: number, now: number) => !dismissedAt || now - dismissedAt >= QUIET_REMIND_MS

// ── Auto sign-out ───────────────────────────────────────────
/** After this long with no touch, no sound on the input and no music playing, ask "are you still using the studio?"; a minute later, sign out. */
export const IDLE_OUT_MS = 30 * 60_000
export const IDLE_WARN_MS = 60_000
export function idleStep(quietMs: number): { warn: boolean; secondsLeft: number; out: boolean } {
  if (quietMs >= IDLE_OUT_MS) return { warn: false, secondsLeft: 0, out: true }
  if (quietMs >= IDLE_OUT_MS - IDLE_WARN_MS) return { warn: true, secondsLeft: Math.ceil((IDLE_OUT_MS - quietMs) / 1000), out: false }
  return { warn: false, secondsLeft: 0, out: false }
}
