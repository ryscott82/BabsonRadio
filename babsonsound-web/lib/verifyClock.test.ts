import test from 'node:test'
import assert from 'node:assert/strict'
import { DELETE_AFTER_MS, REMIND_AFTER_MS, graceEnd, isLockedStage, lockedMayCall, verifyStage } from './verifyClock.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1)
const at = (days: number, over: object = {}) =>
  verifyStage({ emailVerified: false, graceUntil: T0 + 7 * DAY, createdMs: T0, now: T0 + days * DAY, ...over })

test('days 0-7 work as before, day 7 locks, day 10 reminds, day 14 deletes', () => {
  assert.equal(at(0), 'grace')
  assert.equal(at(6.99), 'grace')
  assert.equal(at(7), 'locked')
  assert.equal(at(9.99), 'locked')
  assert.equal(at(10), 'remind')
  assert.equal(at(13.99), 'remind')
  assert.equal(at(14), 'delete')
  assert.equal(at(60), 'delete')
  assert.equal(REMIND_AFTER_MS, 3 * DAY)
  assert.equal(DELETE_AFTER_MS, 7 * DAY)
})

test('a verified account is never locked or deleted, and the demo account is exempt', () => {
  assert.equal(at(30, { emailVerified: true }), 'verified')
  assert.equal(at(30, { exempt: true }), 'exempt')
  assert.equal(isLockedStage(at(30, { emailVerified: true })), false)
  assert.equal(isLockedStage(at(30, { exempt: true })), false)
})

test('guests are on the same clock as students', () => {
  // the clock does not look at the email domain at all
  assert.equal(at(8, { graceUntil: T0 + 7 * DAY }), 'locked')
})

test('with no claim, grace is 7 days from creation', () => {
  assert.equal(graceEnd(null, T0), T0 + 7 * DAY)
  assert.equal(at(8, { graceUntil: null }), 'locked')
  assert.equal(at(15, { graceUntil: undefined }), 'delete')
})

test('an Apple account that sets a school email starts its clock then', () => {
  const setAt = T0 + 40 * DAY // account made long ago, school email set on day 40
  const stage = (d: number) => verifyStage({ emailVerified: false, graceUntil: setAt + 7 * DAY, createdMs: T0, now: setAt + d * DAY })
  assert.equal(stage(1), 'grace')
  assert.equal(stage(8), 'locked')
  assert.equal(stage(15), 'delete')
})

test('locked accounts reach only /api/me, /api/auth and the account routes', () => {
  for (const p of ['/api/me', '/api/auth/signup', '/api/auth/apple/school-email', '/api/me/delete', '/api/me/school-email', '/api/guest/status'])
    assert.equal(lockedMayCall(p), true, p)
  for (const p of ['/api/me/phone', '/api/me/setup', '/api/contacts/match', '/api/presence', '/api/live/rating', '/api/menu', '/api/mex', '/api/me/'])
    assert.equal(lockedMayCall(p), false, p)
})
