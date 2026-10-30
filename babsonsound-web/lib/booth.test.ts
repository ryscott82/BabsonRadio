import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attestSig, liveWindowOpen, signToken, verifyAttest, verifyToken } from './booth.ts'

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
