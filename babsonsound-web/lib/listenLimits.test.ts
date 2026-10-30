// Run with:  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_AUDIENCE, NEVER_MIN, audienceErrors, cleanAudience, effectiveLimits, hourLabel, isQuiet } from './listenLimits.ts'

test('stored values are kept inside their range, anything else falls back', () => {
  assert.deepEqual(cleanAudience({ idleMin: 30, sessionMaxMin: 0, dailyCapMin: 90, quietEnabled: false }), { ...DEFAULT_AUDIENCE, idleMin: 30, sessionMaxMin: 0, dailyCapMin: 90, quietEnabled: false })
  assert.equal(cleanAudience({ idleMin: -5 }).idleMin, DEFAULT_AUDIENCE.idleMin)
  assert.equal(cleanAudience({ quietStart: 24 }).quietStart, DEFAULT_AUDIENCE.quietStart)
  assert.equal(cleanAudience('nope').sessionMaxMin, DEFAULT_AUDIENCE.sessionMaxMin)
})

test('out-of-range posts are named', () => {
  assert.deepEqual(audienceErrors({ idleMin: 5000, quietStart: 3, dailyCapMin: 'x' }), ['idleMin', 'dailyCapMin'])
  assert.deepEqual(audienceErrors({}), [])
})

test('0 means no limit, and the monthly budget can only make limits tighter', () => {
  const a = { ...DEFAULT_AUDIENCE, idleMin: 0, sessionMaxMin: 0, dailyCapMin: 0 }
  assert.deepEqual(effectiveLimits(a, null), { idleMin: NEVER_MIN, sessionMaxMin: 0, dailyCapMin: 0 })
  assert.deepEqual(effectiveLimits(a, { idleMin: 30, sessionMaxMin: 120, dailyCapMin: 60 }), { idleMin: 30, sessionMaxMin: 120, dailyCapMin: 60 })
  const b = { ...DEFAULT_AUDIENCE, idleMin: 20, sessionMaxMin: 90, dailyCapMin: 45 }
  assert.deepEqual(effectiveLimits(b, { idleMin: 30, sessionMaxMin: 60, dailyCapMin: null }), { idleMin: 20, sessionMaxMin: 60, dailyCapMin: 45 })
})

test('quiet hours, including ones that cross midnight', () => {
  const q = { quietEnabled: true, quietStart: 2, quietEnd: 6 }
  assert.equal(isQuiet(q, 1.9), false); assert.equal(isQuiet(q, 2), true); assert.equal(isQuiet(q, 5.99), true); assert.equal(isQuiet(q, 6), false)
  const n = { quietEnabled: true, quietStart: 23, quietEnd: 5 }
  assert.equal(isQuiet(n, 23.5), true); assert.equal(isQuiet(n, 3), true); assert.equal(isQuiet(n, 12), false)
  assert.equal(isQuiet({ ...q, quietEnabled: false }, 3), false)
  assert.equal(isQuiet({ quietEnabled: true, quietStart: 4, quietEnd: 4 }, 4), false)
})

test('hour labels', () => { assert.equal(hourLabel(0), '12am'); assert.equal(hourLabel(6), '6am'); assert.equal(hourLabel(12), '12pm'); assert.equal(hourLabel(23), '11pm') })
