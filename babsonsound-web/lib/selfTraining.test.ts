import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SELF_MIN_WATCH_MS, SELF_QUESTIONS, SELF_RETRY_MS, drawQuestions, drawQuiz, selfQuizGate, watchLeftSec } from './selfTraining.ts'
import { QUIZ } from './training.ts'

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

describe('drawQuiz (3 radio: one slurs, one privacy, one on air; 7 studio)', () => {
  const count = (qs: { topic: string }[], t: string) => qs.filter(q => q.topic === t).length
  it('every draw has exactly that mix, 10 different questions, and no rules questions', () => {
    for (let i = 0; i < 200; i++) {
      const d = drawQuiz(QUIZ, SELF_QUESTIONS, `u${i}:${i % 7}`)
      assert.equal(d.length, SELF_QUESTIONS)
      assert.equal(new Set(d.map(q => q.id)).size, SELF_QUESTIONS)
      assert.equal(count(d, 'slurs'), 1); assert.equal(count(d, 'privacy'), 1); assert.equal(count(d, 'radio'), 1); assert.equal(count(d, 'studio'), 7)
      assert.equal(count(d, 'rules'), 0)
    }
  })
  it('is the same for the same person and attempt (so the server grades what was shown), different for the next attempt', () => {
    assert.deepEqual(drawQuiz(QUIZ, 10, 'u:0').map(q => q.id), drawQuiz(QUIZ, 10, 'u:0').map(q => q.id))
    assert.notDeepEqual(drawQuiz(QUIZ, 10, 'u:0').map(q => q.id), drawQuiz(QUIZ, 10, 'u:1').map(q => q.id))
  })
  it('the slur and privacy questions are not always first or the same one', () => {
    const firstTopics = new Set(Array.from({ length: 50 }, (_, i) => drawQuiz(QUIZ, 10, `s${i}`)[0].topic))
    assert.ok(firstTopics.has('studio'))
    const slurIds = new Set(Array.from({ length: 50 }, (_, i) => drawQuiz(QUIZ, 10, `s${i}`).find(q => q.topic === 'slurs')!.id))
    assert.ok(slurIds.size > 1)
  })
  it('the pool has enough of each topic, unique ids, and every answer is one of the options', () => {
    assert.ok(count(QUIZ, 'studio') >= 10, 'enough studio questions that the 7 vary')
    assert.ok(count(QUIZ, 'radio') >= 3)
    assert.equal(count(QUIZ, 'technical'), 0)
    assert.ok(count(QUIZ, 'slurs') >= 1 && count(QUIZ, 'privacy') >= 1)
    assert.equal(new Set(QUIZ.map(q => q.id)).size, QUIZ.length)
    for (const q of QUIZ) assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id)
  })
})

test('the door QR question is on every quiz, even when a saved bank does not have it', async () => {
  const { QUIZ } = await import('./training.ts')
  const { drawQuiz, withRequired, SELF_QUESTIONS } = await import('./selfTraining.ts')
  const q = QUIZ.find(x => x.id === 'door-qr')!
  assert.equal(q.options[q.answer], 'You must scan the door QR code before tapping your OneCard to gain access to the radio room')
  const saved = QUIZ.filter(x => x.id !== 'door-qr') // an old saved bank, or one where it was deleted
  const pool = withRequired(saved, QUIZ)
  assert.equal(pool.some(x => x.id === 'door-qr'), true)
  for (let i = 0; i < 200; i++) {
    const quiz = drawQuiz(pool, SELF_QUESTIONS, `seed-${i}`)
    assert.equal(quiz.length, SELF_QUESTIONS)
    assert.equal(quiz.filter(x => x.id === 'door-qr').length, 1, `quiz ${i}`)
    assert.equal(quiz.filter(x => x.topic === 'slurs' || x.topic === 'privacy' || x.topic === 'radio').length, 3)
  }
})
