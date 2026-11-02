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

/** u: uid, n: name, s: studio session id, l: may go live (false = may only end the stream), exp: ms. */
export interface BoothClaims { u: string; n: string; s: string; l: boolean; exp: number }

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
/** Below this (short-term) a show is too quiet; above LOUD it is too loud. */
export const QUIET_LUFS = -20
export const LOUD_LUFS = -9
/** Peak level (dBFS) treated as clipping, and below which the input counts as silent. */
export const CLIP_DBFS = -0.5
export const SILENT_DBFS = -55

export type LevelState = 'off' | 'silent' | 'quiet' | 'good' | 'loud' | 'clip'

/** One word for the host, from the short-term loudness, the recent peak, and whether anything clipped in the last 2 seconds. */
export function levelState(shortLufs: number, peakDb: number, clippedRecently: boolean): LevelState {
  if (!Number.isFinite(peakDb) || peakDb < SILENT_DBFS) return 'silent'
  if (clippedRecently) return 'clip'
  if (shortLufs > LOUD_LUFS) return 'loud'
  if (shortLufs < QUIET_LUFS) return 'quiet'
  return 'good'
}

/** BS.1770 loudness from a mean square of K-weighted samples. */
export const lufsOf = (meanSquare: number) => (meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity)
export const dbOf = (amp: number) => (amp > 0 ? 20 * Math.log10(amp) : -Infinity)

// ── Ad breaks ───────────────────────────────────────────────
/** Station-wide ad break times (minutes past every hour) and how long each lasts. Set in Admin Panel → Studio PC log. */
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
