import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BYPASS_UID, QUIET_REMIND_MS, canGoLiveOpenFloor, quietReminderDue, nextThemeSwitch, pinMatches, themeNow, type QuietTracker, QUIET_BANNER, QUIET_CLEAR_LUFS, QUIET_HOLD_MS, QUIET_LUFS, QUIET_WARMUP_MS, TARGET_LUFS, gatedLufs, newQuietTracker, stepQuiet, adBreak, attestSig, bookingLines, quietBanner, readToken, nextGain, cleanAdPlan, dbOf, levelState, liveWindowOpen, lufsOf, signToken, verifyAttest, verifyToken } from './booth.ts'

const S = 'test-secret-123'

test('control token round trip, expiry and tampering', () => {
  const now = 1_800_000_000_000
  const t = signToken(S, { u: 'abc', n: 'Ryan', s: 'sess1', l: true, exp: now + 60_000 })
  assert.deepEqual(verifyToken(S, t, now), { u: 'abc', n: 'Ryan', s: 'sess1', l: true, exp: now + 60_000 })
  assert.equal(verifyToken(S, t, now + 61_000), null)
  assert.equal(verifyToken('other', t, now), null)
  const [body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ u: 'evil', n: 'x', s: 's', l: true, exp: now + 1e9 })).toString('base64url')
  assert.equal(verifyToken(S, `${forged}.${sig}`, now), null)
  assert.equal(verifyToken(S, `${body}`, now), null)
  assert.equal(verifyToken(S, `${t}.x`, now), null)
})

test('attest accepts a fresh signed nonce only', () => {
  const now = 1_800_000_000_000
  const nonce = `${now}.abcdEFGH1234`
  assert.equal(verifyAttest(S, nonce, attestSig(S, nonce), now + 5_000), true)
  assert.equal(verifyAttest(S, nonce, attestSig(S, nonce), now + 5 * 60_000), false)
  assert.equal(verifyAttest(S, nonce, attestSig('other', nonce), now), false)
  assert.equal(verifyAttest(S, 'garbage', attestSig(S, 'garbage'), now), false)
  assert.equal(verifyAttest(S, nonce, 'zz', now), false)
})

test('live window opens 30 minutes early and closes 30 minutes late', () => {
  const s = { startAt: 10 * 3_600_000, endAt: 11 * 3_600_000 }
  assert.equal(liveWindowOpen(s, s.startAt - 31 * 60_000), false)
  assert.equal(liveWindowOpen(s, s.startAt - 29 * 60_000), true)
  assert.equal(liveWindowOpen(s, s.endAt + 29 * 60_000), true)
  assert.equal(liveWindowOpen(s, s.endAt + 31 * 60_000), false)
})

test('level words: good, loud, clip, silent respond at once; quiet only comes from the slow tracker', () => {
  assert.equal(levelState(-14, -6, false), 'good')
  assert.equal(levelState(-25, -20, false), 'good') // a quiet short-term value alone is not "too quiet"
  assert.equal(levelState(-25, -20, false, true), 'quiet')
  assert.equal(levelState(-7, -1, false), 'loud')
  assert.equal(levelState(-14, -0.2, true), 'clip')
  assert.equal(levelState(-70, -60, false), 'silent')
  assert.equal(levelState(-Infinity, -Infinity, false), 'silent')
  assert.equal(levelState(-7, -1, false, true), 'loud') // loud wins over a stale quiet flag
  assert.equal(TARGET_LUFS, -14)
})

const ms = (lufs: number) => Math.pow(10, (lufs + 0.691) / 10)

test('gated loudness ignores silence and quiet passages', () => {
  const speech = Array(40).fill(ms(-20))
  assert.ok(Math.abs(gatedLufs(speech) - -20) < 0.01)
  // silence (below -70) and a passage more than 10 LU under the rest do not pull the average down
  const mixed = [...speech, ...Array(30).fill(ms(-80)), ...Array(10).fill(ms(-38))]
  assert.ok(Math.abs(gatedLufs(mixed) - -20) < 0.01)
  assert.equal(gatedLufs([]), -Infinity)
  assert.equal(gatedLufs(Array(10).fill(ms(-90))), -Infinity)
})

test('too quiet needs 60 s below the limit, after a 30 s warm-up', () => {
  let t = newQuietTracker(0)
  // in the warm-up nothing shows, however quiet
  for (let s = 0; s < QUIET_WARMUP_MS; s += 1000) { t = stepQuiet(t, s, -30); assert.equal(t.quiet, false) }
  // then it has to stay below for the full hold
  const start = QUIET_WARMUP_MS
  for (let s = 0; s < QUIET_HOLD_MS; s += 1000) { t = stepQuiet(t, start + s, -30); assert.equal(t.quiet, false) }
  t = stepQuiet(t, start + QUIET_HOLD_MS, -30)
  assert.equal(t.quiet, true)
  assert.equal(levelState(-30, -20, false, t.quiet), 'quiet')
})

test('too quiet: a recovery resets the timer, and healthy speech never triggers it', () => {
  let t = newQuietTracker(0)
  t = stepQuiet(t, 40_000, -30)
  t = stepQuiet(t, 90_000, QUIET_LUFS + 0.5) // back above the limit before 60 s
  assert.equal(t.belowSince, null)
  t = stepQuiet(t, 100_000, -30)
  t = stepQuiet(t, 150_000, -30)
  assert.equal(t.quiet, false) // only 50 s since it dropped again
  let h = newQuietTracker(0)
  for (let s = 30_000; s < 600_000; s += 1000) h = stepQuiet(h, s, -21.5) // speech at -21.5 LUFS
  assert.equal(h.quiet, false)
})

test('too quiet has hysteresis: it clears only above the clear level', () => {
  let t: QuietTracker = { belowSince: 0, quiet: true, warmFrom: 0 }
  t = stepQuiet(t, 200_000, QUIET_LUFS + 0.5) // just over the enter limit, still under the clear level
  assert.equal(t.quiet, true)
  t = stepQuiet(t, 201_000, QUIET_CLEAR_LUFS + 0.5)
  assert.equal(t.quiet, false)
  t = stepQuiet(t, 202_000, QUIET_LUFS + 0.5) // and it does not flip straight back
  assert.equal(t.quiet, false)
})

test('going live or a track change restarts the warm-up and hides Too quiet', () => {
  let t: QuietTracker = { belowSince: 0, quiet: true, warmFrom: 0 }
  t = stepQuiet(t, 500_000, -30, true)
  assert.equal(t.quiet, false)
  t = stepQuiet(t, 500_000 + QUIET_WARMUP_MS - 1000, -30)
  assert.equal(t.quiet, false)
  assert.equal(t.belowSince, null)
})

test('a full-scale sine reads about -3 LUFS and -0 dBFS peak', () => {
  // mean square of a sine with amplitude 1 is 0.5
  assert.ok(Math.abs(lufsOf(0.5) - -3.70) < 0.02)
  assert.equal(dbOf(1), 0)
  assert.equal(lufsOf(0), -Infinity)
})

test('ad breaks: next one, during one, and across the hour', () => {
  const plan = cleanAdPlan({ enabled: true, minutes: [50, 20, 20, 75], lengthSec: 120 })
  assert.deepEqual(plan.minutes, [20, 50])
  const at = (h: number, m: number, s = 0) => new Date(2026, 9, 30, h, m, s).getTime()
  assert.deepEqual(adBreak(plan, at(14, 5)), { start: at(14, 20), end: at(14, 22), now: false })
  assert.deepEqual(adBreak(plan, at(14, 21)), { start: at(14, 20), end: at(14, 22), now: true })
  assert.deepEqual(adBreak(plan, at(14, 22, 1)), { start: at(14, 50), end: at(14, 52), now: false })
  assert.deepEqual(adBreak(plan, at(14, 55)), { start: at(15, 20), end: at(15, 22), now: false })
  assert.equal(adBreak({ ...plan, enabled: false }, at(14, 5)), null)
  assert.equal(cleanAdPlan({ enabled: true, lengthSec: 5 }).lengthSec, 120)
})

test('auto level moves slowly toward -14, holds in pauses, drops fast on clipping', () => {
  assert.equal(nextGain(0, -20, -18, false), 0.5)        // too quiet: up half a dB
  assert.equal(nextGain(0, -8, -8, false), -1)           // too loud: down 1 dB
  assert.equal(nextGain(2, -16.5, -16, false), 2)        // -14.5 out: inside the deadband
  assert.equal(nextGain(3, -30, -50, false), 3)          // a pause: no change
  assert.equal(nextGain(3, -14, -10, true), 0)           // clipped: down 3 dB
  assert.equal(nextGain(12, -40, -35, false), 12)        // never past +12
  let g = 0
  for (let i = 0; i < 60; i++) g = nextGain(g, -22, -21, false)
  assert.ok(Math.abs(-22 + g - -14) <= 1)                // settles within a minute
})

test('readToken keeps the signature check but not the expiry; r is carried', () => {
  const now = 1_800_000_000_000
  const t = signToken(S, { u: 'abc', n: 'Ryan', s: 's', l: false, r: true, exp: now - 86_400_000 })
  assert.equal(verifyToken(S, t, now), null)
  assert.equal(readToken(S, t)?.r, true)
  assert.equal(readToken('other', t), null)
  assert.equal(readToken(S, t.slice(0, -2) + 'xx'), null)
})

test('quiet banner: 15 minutes before with a countdown, on during, off after; never blocks', () => {
  const start = 1_800_000_000_000, end = start + 7 * 3_600_000
  const before = { quiet: false, quietUntil: null, quietStartsAt: start }
  assert.equal(quietBanner(before, start - 16 * 60_000), null)
  assert.deepEqual(quietBanner(before, start - 15 * 60_000), { kind: 'soon', inMs: 15 * 60_000, startsAt: start })
  assert.deepEqual(quietBanner(before, start - 61_000), { kind: 'soon', inMs: 61_000, startsAt: start })
  assert.deepEqual(quietBanner(before, start), { kind: 'on', until: null }) // the status is a few minutes old: still switches on time
  const during = { quiet: true, quietUntil: end, quietStartsAt: null }
  assert.deepEqual(quietBanner(during, start + 1000), { kind: 'on', until: end })
  assert.equal(quietBanner(during, end), null)
  assert.equal(quietBanner(null, start), null)
  assert.equal(quietBanner({ quiet: false, quietUntil: null, quietStartsAt: null }, start), null)
  assert.equal(QUIET_BANNER, 'Quiet hours: keep the volume as low as possible. No loud DJ sets.')
})

test('booking lines: booked now by someone else, next within 90 minutes, nothing for my own booking', () => {
  const now = 1_800_000_000_000, h = 3_600_000, t = (ms: number) => `T${(ms - now) / 60_000}`
  const cur = { id: 'b1', startAt: now - h, endAt: now + h / 2, name: 'Alex' }
  const next = { id: 'b2', startAt: now + h, endAt: now + 2 * h, name: 'Jo' }
  assert.deepEqual(bookingLines({ bookings: [cur, next] }, '', now, t), ['Booked now by Alex', 'Next booking: T60, Jo'])
  assert.deepEqual(bookingLines({ bookings: [cur, next] }, 'b1', now, t), ['Next booking: T60, Jo'])
  assert.deepEqual(bookingLines({ bookings: [{ ...next, startAt: now + 91 * 60_000 }] }, '', now, t), [])
  assert.deepEqual(bookingLines({ bookings: [{ ...next, startAt: now + 90 * 60_000 }] }, '', now, t), ['Next booking: T90, Jo'])
  assert.deepEqual(bookingLines({ bookings: [next] }, 'b2', now, t), [])
  assert.deepEqual(bookingLines(null, '', now, t), [])
})

test('day/night: the clock decides, and a forced choice lasts until the next automatic switch', () => {
  const at = (h: number, m = 0, d = 30) => new Date(2026, 9, d, h, m).getTime()
  assert.equal(nextThemeSwitch(at(10)), at(19))
  assert.equal(nextThemeSwitch(at(20)), at(7, 0, 31))
  assert.equal(nextThemeSwitch(at(3)), at(7))
  assert.equal(nextThemeSwitch(at(19)), at(7, 0, 31)) // exactly at a switch: the next one
  assert.equal(themeNow(at(10), null), false)
  assert.equal(themeNow(at(20), null), true)
  const forcedNight = { night: true, until: nextThemeSwitch(at(10)) } // forced dark at 10 am
  assert.equal(themeNow(at(15), forcedNight), true)
  assert.equal(themeNow(at(19, 1), forcedNight), true) // 7 pm is night anyway
  const forcedDay = { night: false, until: nextThemeSwitch(at(21)) } // forced light at 9 pm: ends at 7 am
  assert.equal(themeNow(at(23), forcedDay), false)
  assert.equal(themeNow(at(7, 1, 31), forcedDay), false)
  assert.equal(themeNow(at(20, 0, 31), forcedDay), true) // next evening it is automatic again
})

test('emergency PIN: exact match only, never an empty PIN', () => {
  assert.equal(pinMatches('4821', '4821'), true)
  assert.equal(pinMatches('4821', '4822'), false)
  assert.equal(pinMatches('4821', '482'), false)
  assert.equal(pinMatches('', ''), false)
  assert.equal(BYPASS_UID, 'studio-pc')
})

test('open floor: needs radio training, a past live show, and no scheduled show running', () => {
  assert.equal(canGoLiveOpenFloor({ radio: true, hostedBefore: true, showRunning: false }), true)
  assert.equal(canGoLiveOpenFloor({ radio: true, hostedBefore: true, showRunning: true }), false)
  assert.equal(canGoLiveOpenFloor({ radio: true, hostedBefore: false, showRunning: false }), false)
  assert.equal(canGoLiveOpenFloor({ radio: false, hostedBefore: true, showRunning: false }), false)
})

test('quiet-hours reminder shows at first, hides when dismissed, and returns after half an hour', () => {
  assert.equal(quietReminderDue(0, 1_000_000), true)
  assert.equal(quietReminderDue(1_000_000, 1_000_000 + QUIET_REMIND_MS - 1), false)
  assert.equal(quietReminderDue(1_000_000, 1_000_000 + QUIET_REMIND_MS), true)
})
