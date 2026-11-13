import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENDING_MS, RETURN_TO_BOOTH_MS, shouldReturnToBooth, micHeard, claimDoorPing, METER_CELLS, cellZone, cellsLit, WELCOME_MS, countdownText, heroMode, BYPASS_UID, IDLE_OUT_MS, IDLE_WARN_MS, QUIET_REMIND_MS, idleStep, canGoLiveOpenFloor, quietReminderDue, nextThemeSwitch, pinMatches, themeNow, type QuietTracker, QUIET_BANNER, QUIET_CLEAR_LUFS, QUIET_HOLD_MS, QUIET_LUFS, QUIET_WARMUP_MS, LONG_WINDOW_MS, levelWord, levelAdvice, newLoudTracker, stepLoud, TARGET_LUFS, gatedLufs, newQuietTracker, stepQuiet, adBreak, attestSig, bookingLines, quietBanner, readToken, nextGain, cleanAdPlan, dbOf, levelState, liveWindowOpen, lufsOf, signToken, verifyAttest, verifyToken } from './booth.ts'

const S = 'test-secret-123'

test('control token keeps the exit panel flag, and a forged flag fails', () => {
  const now = 1_800_000_000_000
  const t = signToken(S, { u: 'abc', n: 'Ryan', s: 's', l: false, x: true, exp: now + 60_000 })
  assert.equal(verifyToken(S, t, now)?.x, true)
  assert.equal(verifyToken(S, signToken(S, { u: 'abc', n: 'Ryan', s: 's', l: false, x: false, exp: now + 60_000 }), now)?.x, false)
  const [, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ u: 'abc', n: 'Ryan', s: 's', l: false, x: true, exp: now + 1e9 })).toString('base64url')
  assert.equal(verifyToken(S, `${forged}.${sig}`, now), null)
})

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
  const ok = { quiet: false, loud: 'ok' as const }
  assert.equal(levelState({ peakDb: -6, ...ok }), 'good')
  assert.equal(levelState({ peakDb: -20, quiet: true, loud: 'ok' }), 'quiet')
  assert.equal(levelState({ peakDb: -3, quiet: false, loud: 'near' }), 'near')
  assert.equal(levelState({ peakDb: -0.2, quiet: false, loud: 'loud' }), 'loud')
  assert.equal(levelState({ peakDb: -60, ...ok }), 'silent')
  assert.equal(levelState({ peakDb: -Infinity, ...ok }), 'silent')
  assert.equal(levelState({ peakDb: -1, quiet: true, loud: 'loud' }), 'loud') // loud wins over a stale quiet flag
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

test('too quiet needs 45 s below the limit, after a short warm-up', () => {
  let t = newQuietTracker(0)
  // in the warm-up nothing shows, however quiet
  for (let s = 0; s < QUIET_WARMUP_MS; s += 1000) { t = stepQuiet(t, s, -30); assert.equal(t.quiet, false) }
  // then it has to stay below for the full hold
  const start = QUIET_WARMUP_MS
  for (let s = 0; s < QUIET_HOLD_MS; s += 1000) { t = stepQuiet(t, start + s, -30); assert.equal(t.quiet, false) }
  t = stepQuiet(t, start + QUIET_HOLD_MS, -30)
  assert.equal(t.quiet, true)
  assert.equal(levelState({ peakDb: -20, quiet: t.quiet, loud: 'ok' }), 'quiet')
  assert.ok(QUIET_HOLD_MS >= 45_000, 'it never leaves Good for quiet in under 45 s')
})

test('too quiet: a recovery resets the timer, and healthy speech never triggers it', () => {
  let t = newQuietTracker(0)
  t = stepQuiet(t, 20_000, -30)
  t = stepQuiet(t, 50_000, QUIET_LUFS + 0.5) // back above the limit before the hold is over
  assert.equal(t.belowSince, null)
  t = stepQuiet(t, 51_000, -30)
  t = stepQuiet(t, 90_000, -30)
  assert.equal(t.quiet, false) // only 39 s since it dropped again
  let h = newQuietTracker(0)
  for (let s = QUIET_WARMUP_MS; s < 600_000; s += 1000) h = stepQuiet(h, s, -17) // speech at -17 LUFS
  assert.equal(h.quiet, false)
})

test('the word and the advice: four colours, advice only for blue, yellow and red', () => {
  assert.deepEqual(levelWord('good'), { word: 'Good', tone: 'ok' })
  assert.deepEqual(levelWord('quiet'), { word: 'Too quiet', tone: 'ok' })
  assert.deepEqual(levelWord('near'), { word: 'Strong level', tone: 'caution' })
  assert.deepEqual(levelWord('loud'), { word: 'Too loud', tone: 'warn' })
  assert.equal(levelWord('silent').word, 'No sound')
  assert.deepEqual(levelAdvice(-14, 'good'), { dir: 'ok', amount: '', db: 0 })
  assert.deepEqual(levelAdvice(-20, 'quiet'), { dir: 'up', amount: 'some', db: 6 })
  assert.deepEqual(levelAdvice(-30, 'quiet'), { dir: 'up', amount: 'a lot', db: 16 })
  assert.equal(levelAdvice(-9, 'near').dir, 'ok')
  assert.deepEqual(levelAdvice(-5, 'loud'), { dir: 'down', amount: 'some', db: 9 })
  assert.equal(levelAdvice(-Infinity, 'loud').amount, 'now'); assert.equal(levelAdvice(-Infinity, 'silent').dir, 'ok')
})

test('red means really too loud: a loud part of a song is not red, sustained loudness or clipping is', () => {
  // 30 s at -9 LUFS (a bit over the goal): yellow, never red
  let t = newLoudTracker()
  for (let s = 0; s < 30_000; s += 250) { t = stepLoud(t, 1_000_000 + s, { midLufs: -9, peakDb: -4 }); assert.notEqual(t.level, 'loud') }
  assert.equal(t.level, 'near')
  // 30 s at -6 LUFS: red
  t = newLoudTracker()
  t = stepLoud(t, 2_000_000, { midLufs: -6, peakDb: -3 })
  assert.equal(t.level, 'loud')
  // a couple of peaks at the top is nothing; clipping in 5 of 10 seconds is red
  t = newLoudTracker()
  for (const s of [0, 3_000]) t = stepLoud(t, 3_000_000 + s, { midLufs: -14, peakDb: -0.2 })
  assert.equal(t.level, 'ok')
  for (const s of [4_000, 5_000, 6_000]) t = stepLoud(t, 3_000_000 + s, { midLufs: -14, peakDb: -0.2 })
  assert.equal(t.level, 'loud')
  // yellow clears about 10 s after the last trigger, not before
  t = newLoudTracker(); t = stepLoud(t, 4_000_000, { midLufs: -9, peakDb: -4 })
  assert.equal(stepLoud(t, 4_005_000, { midLufs: -14, peakDb: -10 }).level, 'near')
  assert.equal(stepLoud(t, 4_011_000, { midLufs: -14, peakDb: -10 }).level, 'ok')
  // normal levels never trigger
  t = newLoudTracker()
  for (let s = 0; s < 60_000; s += 250) t = stepLoud(t, 5_000_000 + s, { midLufs: -14, peakDb: -6 })
  assert.equal(t.level, 'ok')
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

test('auto sign-out: quiet for 29 minutes warns with a 60 second countdown, 30 minutes signs out', () => {
  assert.deepEqual(idleStep(10 * 60_000), { warn: false, secondsLeft: 0, out: false })
  assert.deepEqual(idleStep(IDLE_OUT_MS - IDLE_WARN_MS), { warn: true, secondsLeft: 60, out: false })
  assert.deepEqual(idleStep(IDLE_OUT_MS - 1_500), { warn: true, secondsLeft: 2, out: false })
  assert.deepEqual(idleStep(IDLE_OUT_MS), { warn: false, secondsLeft: 0, out: true })
})

test('booth track titles: tidied the same way as the helper, signed by the site only after the word filter, and the helper needs the signature', async () => {
  const { cleanSig, songText } = await import('./booth.ts')
  const { readFileSync } = await import('node:fs')
  assert.equal(songText('  Artist -\tSong\r\n'), 'Artist - Song')
  assert.equal(songText('x'.repeat(300)).length, 200)
  assert.match(cleanSig(S, 'a'), /^[0-9a-f]{64}$/)
  assert.notEqual(cleanSig(S, 'a'), cleanSig(S, 'b')); assert.notEqual(cleanSig(S, 'a'), cleanSig('other', 'a'))
  const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const ev = src('app/api/booth/event/route.ts')
  assert.ok(ev.indexOf('assertClean(db, title, artist, text)') < ev.indexOf('cleanSig(boothSecret(), text)'), 'checked before it is signed')
  const page = src('app/booth/page.tsx')
  assert.ok(page.indexOf("report('song', { title, artist, text })") < page.indexOf("helper('/song'"), 'checked before it is sent')
  assert.match(page, /cleanSig: r\.sig/)
  const helperSrc = src('../tools/studio-helper/helper.mjs')
  assert.match(helperSrc, /if \(!cleanOk\(text, b\.cleanSig\)\)/); assert.match(helperSrc, /mac\(`clean:\$\{text\}`\)/)
  const start = src('app/api/booth/recordings/start/route.ts')
  assert.match(start, /hosts: raw\.hosts\.map\(censor\), description: censor\(raw\.description\)/); assert.match(start, /if \(!live\) await assertClean/)
})

test('hero message: welcome for 15 minutes, or while nothing is booked, then a countdown, show name when live', () => {
  const now = 1_800_000_000_000, next = now + 3_600_000
  assert.equal(heroMode({ live: false, connecting: false, sinceMs: 0, nextStartAt: next, now }), 'welcome')
  assert.equal(heroMode({ live: false, connecting: false, sinceMs: WELCOME_MS - 1, nextStartAt: next, now }), 'welcome')
  assert.equal(heroMode({ live: false, connecting: false, sinceMs: WELCOME_MS, nextStartAt: next, now }), 'countdown')
  assert.equal(heroMode({ live: false, connecting: false, sinceMs: WELCOME_MS * 4, nextStartAt: null, now }), 'welcome')
  assert.equal(heroMode({ live: false, connecting: false, sinceMs: WELCOME_MS * 4, nextStartAt: now - 1, now }), 'welcome')
  assert.equal(heroMode({ live: true, connecting: false, sinceMs: 0, nextStartAt: next, now }), 'live')
  assert.equal(heroMode({ live: false, connecting: true, sinceMs: WELCOME_MS * 4, nextStartAt: null, now }), 'live')
})
test('countdown text', () => {
  assert.equal(countdownText(65_000), '1:05')
  assert.equal(countdownText(3_725_000), '1:02:05')
  assert.equal(countdownText(-5), '0:00')
})

test('segmented bar: green low, yellow near the top, red at the very top, no blue', () => {
  assert.equal(METER_CELLS, 32)
  const zones = Array.from({ length: METER_CELLS }, (_, i) => cellZone(i))
  assert.equal(zones[0], 'green'); assert.equal(zones[19], 'green'); assert.equal(zones[20], 'yellow'); assert.equal(zones[28], 'yellow'); assert.equal(zones[29], 'red'); assert.equal(zones[31], 'red')
  assert.deepEqual([...new Set(zones)], ['green', 'yellow', 'red'])
  assert.equal(cellsLit(-Infinity), 0); assert.equal(cellsLit(NaN), 0); assert.equal(cellsLit(-60), 0); assert.equal(cellsLit(-36), 0)
  assert.equal(cellsLit(-35), 1); assert.equal(cellsLit(-14), 22); assert.equal(cellsLit(0), METER_CELLS)
  // the sweet spot (-14 LUFS) lights green and the first yellow cells; "too quiet" (-25) stays in green
  assert.equal(zones[cellsLit(-14) - 1], 'yellow'); assert.equal(zones[cellsLit(-25) - 1], 'green')
})

test('door scan while the panel was closed: claimed on the first snapshot only when under 60 seconds old', () => {
  const now = 1_800_000_000_000
  assert.equal(claimDoorPing({ first: true, claimId: 'a', lastId: '', at: now - 30_000, now }), true)
  assert.equal(claimDoorPing({ first: true, claimId: 'a', lastId: '', at: now - 61_000, now }), false)
  assert.equal(claimDoorPing({ first: true, claimId: '', lastId: '', at: now, now }), false)
  assert.equal(claimDoorPing({ first: false, claimId: 'b', lastId: 'a', at: now - 500_000, now }), true)
  assert.equal(claimDoorPing({ first: false, claimId: 'a', lastId: 'a', at: now, now }), false)
})

test('mic check ticks itself once sound reaches the input', () => {
  for (const l of ['quiet', 'good', 'near', 'loud'] as const) assert.equal(micHeard(l), true)
  for (const l of ['off', 'silent'] as const) assert.equal(micHeard(l), false)
})

test('return to the booth after 90 seconds without input, but never on air, recording, with sound, or signed in', () => {
  const base = { pathname: '/signin', idleMs: RETURN_TO_BOOTH_MS, onAir: false, recording: false, soundOnInput: false, signedIn: false }
  assert.equal(shouldReturnToBooth(base), true)
  assert.equal(shouldReturnToBooth({ ...base, idleMs: RETURN_TO_BOOTH_MS - 1 }), false)
  assert.equal(shouldReturnToBooth({ ...base, pathname: '/booth' }), false)
  assert.equal(shouldReturnToBooth({ ...base, onAir: true }), false)
  assert.equal(shouldReturnToBooth({ ...base, recording: true }), false)
  assert.equal(shouldReturnToBooth({ ...base, soundOnInput: true }), false)
  assert.equal(shouldReturnToBooth({ ...base, signedIn: true }), false)
})

test('hero: the show name takes over while it runs, the countdown in the last 10 minutes, overtime after', () => {
  const now = 1_800_000_000_000
  const base = { live: false, connecting: false, sinceMs: 0, nextStartAt: null, now }
  const run = { startAt: now - 30 * 60_000, endAt: now + 30 * 60_000 }
  assert.equal(heroMode({ ...base, show: run }), 'show')
  assert.equal(heroMode({ ...base, show: { ...run, endAt: now + ENDING_MS } }), 'ending')
  assert.equal(heroMode({ ...base, show: { ...run, endAt: now + ENDING_MS + 1 } }), 'show')
  assert.equal(heroMode({ ...base, live: true, show: { ...run, endAt: now - 1000 } }), 'over')
  assert.equal(heroMode({ ...base, show: { ...run, endAt: now - 1000 } }), 'welcome')           // over and not on air: back to the welcome
  assert.equal(heroMode({ ...base, show: { startAt: now + 60_000, endAt: now + 3_600_000 } }), 'welcome') // not started yet
  assert.equal(heroMode({ ...base, live: true }), 'live')
})
