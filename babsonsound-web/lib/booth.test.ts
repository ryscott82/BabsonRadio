import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adBreak, attestSig, nextGain, cleanAdPlan, dbOf, levelState, liveWindowOpen, lufsOf, signToken, verifyAttest, verifyToken } from './booth.ts'

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

test('level words follow loudness, peaks and clipping', () => {
  assert.equal(levelState(-14, -6, false), 'good')
  assert.equal(levelState(-25, -20, false), 'quiet')
  assert.equal(levelState(-7, -1, false), 'loud')
  assert.equal(levelState(-14, -0.2, true), 'clip')
  assert.equal(levelState(-70, -60, false), 'silent')
  assert.equal(levelState(-Infinity, -Infinity, false), 'silent')
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
