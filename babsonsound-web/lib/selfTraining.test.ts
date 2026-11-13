import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SELF_MIN_WATCH_MS, SELF_RETRY_MS, drawQuestions, selfQuizGate, watchLeftSec } from './selfTraining.ts'

const pool = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }))

describe('drawQuestions', () => {
  it('is stable for a seed, varies across seeds, never repeats', () => {
    const a = drawQuestions(pool, 10, 'u:0'), b = drawQuestions(pool, 10, 'u:0'), c = drawQuestions(pool, 10, 'u:1')
    assert.deepEqual(a, b); assert.notDeepEqual(a, c)
    assert.equal(new Set(a.map(q => q.id)).size, 10)
  })
  it('handles a small pool', () => { assert.equal(drawQuestions(pool.slice(0, 4), 10, 's').length, 4) })
})

describe('selfQuizGate', () => {
  it('makes you watch first', () => {
    assert.equal(selfQuizGate({ startedAt: 1000, lastAttemptAt: 0, now: 1000 + SELF_MIN_WATCH_MS - 1 }).ok, false)
    assert.equal(selfQuizGate({ startedAt: 1000, lastAttemptAt: 0, now: 1000 + SELF_MIN_WATCH_MS }).ok, true)
  })
  it('makes you wait between attempts', () => {
    const t = 10 * SELF_MIN_WATCH_MS
    assert.equal(selfQuizGate({ startedAt: 1, lastAttemptAt: t, now: t + SELF_RETRY_MS - 1 }).ok, false)
    assert.equal(selfQuizGate({ startedAt: 1, lastAttemptAt: t, now: t + SELF_RETRY_MS }).ok, true)
  })
  it('counts down', () => { assert.equal(watchLeftSec(1, 1), SELF_MIN_WATCH_MS / 1000); assert.equal(watchLeftSec(1, 1 + SELF_MIN_WATCH_MS), 0) })
})
