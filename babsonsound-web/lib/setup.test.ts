// Run with:  npm test   (Node's built-in test runner; no extra packages)
import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKOFF_MS, PROMPT_GAP_MS, offerable, setupState, stepsFor, type SetupInput } from './setup.ts'
import { judgeAge } from './age.ts'

const NOW = Date.UTC(2026, 9, 27, 15, 0, 0) // Oct 27, 2026
const MIN = 60_000, DAY = 24 * 60 * MIN

/** A student who is verified but has done nothing else. */
const base = (over: Partial<SetupInput> = {}): SetupInput => ({
  level: 'student', demo: false, emailVerified: true, graceUntil: null, joinedAt: NOW - DAY,
  firstName: '', avatarChosen: false, birthdayDone: false, gradYear: '', hasPhone: false, hasInstagram: false, skips: {}, lastPromptAt: 0, ...over,
})

test('steps come in order and the first undone one is next', () => {
  const s = setupState(base({ emailVerified: false }), NOW)
  assert.deepEqual(s.steps.map(x => x.id), ['verifyEmail', 'name', 'avatar', 'birthday', 'gradYear', 'phone', 'instagram'])
  assert.equal(s.next, 'name') // verifying the email has its own banner; it is never the prompt
  assert.equal(setupState(base(), NOW).next, 'name')
  assert.equal(setupState(base({ firstName: 'Ryan' }), NOW).next, 'avatar')
  assert.equal(setupState(base({ firstName: 'Ryan', avatarChosen: true }), NOW).next, 'birthday')
})

test('counts and the email deadline', () => {
  const s = setupState(base({ emailVerified: false, graceUntil: NOW + 3 * DAY, firstName: 'R' }), NOW)
  assert.equal(s.total, 7) // verify, name, avatar, birthday, grad year, phone, instagram (a student)
  assert.equal(s.doneCount, 1)
  assert.equal(s.emailDeadlineAt, NOW + 3 * DAY)
  assert.equal(setupState(base(), NOW).emailDeadlineAt, null)
  // no claim on the token: seven days from joining
  assert.equal(setupState(base({ emailVerified: false, graceUntil: null, joinedAt: NOW - DAY }), NOW).emailDeadlineAt, NOW + 6 * DAY)
})

test('skip back-off: offered again every visit for 3 skips, then once per 7 days', () => {
  const at = (count: number, ago: number) => ({ name: { count, lastShownAt: NOW - ago, lastSkippedAt: NOW - ago } })
  for (const count of [0, 1, 2]) assert.equal(offerable(at(count, MIN).name, NOW), true, `count ${count}`)
  assert.equal(offerable(at(3, 6 * DAY).name, NOW), false)
  assert.equal(offerable(at(3, BACKOFF_MS - 1).name, NOW), false)
  assert.equal(offerable(at(3, BACKOFF_MS).name, NOW), true)
  assert.equal(offerable(at(9, 2 * DAY).name, NOW), false)
  assert.equal(offerable(undefined, NOW), true)

  // through the whole state: a backed-off step is passed over, then comes back after a week
  assert.equal(setupState(base({ skips: at(2, 2 * MIN) }), NOW).next, 'name')
  assert.equal(setupState(base({ skips: at(3, DAY) }), NOW).next, 'avatar')
  assert.equal(setupState(base({ skips: at(3, 8 * DAY) }), NOW).next, 'name')
})

test('one prompt per visit: nothing is offered for 30 minutes after a prompt', () => {
  assert.equal(setupState(base({ lastPromptAt: NOW - 5 * MIN }), NOW).next, null)
  assert.equal(setupState(base({ lastPromptAt: NOW - (PROMPT_GAP_MS - 1) }), NOW).next, null)
  assert.equal(setupState(base({ lastPromptAt: NOW - PROMPT_GAP_MS }), NOW).next, 'name')
  assert.equal(setupState(base({ lastPromptAt: NOW - 2 * DAY }), NOW).next, 'name')
  // the list itself is still reported while the prompt is held back
  assert.equal(setupState(base({ lastPromptAt: NOW - MIN }), NOW).steps.length, 7)
})

test('a Guest never gets the graduation year step', () => {
  assert.equal(stepsFor('guest').includes('gradYear'), false)
  for (const level of ['student', 'director', 'admin']) assert.equal(stepsFor(level).includes('gradYear'), true, level)
  // a Guest who has done everything else has nothing left to be asked
  const done: Partial<SetupInput> = { level: 'guest', firstName: 'G', avatarChosen: true, birthdayDone: true }
  const g = setupState(base(done), NOW)
  assert.equal(g.next, null)
  assert.equal(g.total, 4)
  assert.equal(g.steps.some(s => s.id === 'gradYear' || s.id === 'phone' || s.id === 'instagram'), false)
  // the same person as a student is asked for graduation year, then phone last
  assert.equal(setupState(base({ ...done, level: 'student' }), NOW).next, 'gradYear')
  assert.equal(setupState(base({ ...done, level: 'student', gradYear: '2028' }), NOW).next, 'phone')
  assert.equal(setupState(base({ ...done, level: 'student', gradYear: '2028', hasPhone: true }), NOW).next, 'instagram')
  assert.equal(stepsFor('student').at(-1), 'instagram')
  assert.equal(stepsFor('guest').includes('instagram'), false)
  assert.equal(stepsFor('guest').includes('phone'), false)
})

test('the email step is required and every other step can be skipped', () => {
  const s = setupState(base({ emailVerified: false }), NOW)
  assert.deepEqual(s.steps.filter(x => x.required).map(x => x.id), ['verifyEmail'])
})

test('an unverified email never blocks the prompts for the other steps', () => {
  const s = setupState(base({ emailVerified: false, firstName: 'R', avatarChosen: true }), NOW)
  assert.equal(s.next, 'birthday')
  assert.equal(setupState(base({ emailVerified: false, level: 'student', firstName: 'R', avatarChosen: true, birthdayDone: true, gradYear: '2028', hasPhone: true, hasInstagram: true }), NOW).next, null)
})

test('the demo account has nothing to set up', () => {
  const s = setupState(base({ demo: true, emailVerified: false }), NOW)
  assert.equal(s.next, null)
  assert.equal(s.doneCount, s.total)
  assert.equal(s.emailDeadlineAt, null)
})

test('age: a year alone is enough unless it sits on the 13 or 18 line', () => {
  const now = new Date(NOW)
  assert.equal(judgeAge(2000, null, null, now).kind, 'adult')
  assert.equal(judgeAge(2010, null, null, now).kind, 'minor')      // 15 or 16
  assert.equal(judgeAge(2013, null, null, now).kind, 'ask-more')   // 12 or 13
  assert.equal(judgeAge(2008, null, null, now).kind, 'ask-more')   // 17 or 18
  assert.equal(judgeAge(2014, null, null, now).kind, 'under13')    // 11 or 12
  assert.equal(judgeAge(2020, null, null, now).kind, 'under13')
})

test('age: with month and day the answer is exact', () => {
  const now = new Date(NOW) // Oct 27, 2026
  assert.equal(judgeAge(2013, 10, 27, now).kind, 'minor')   // turns 13 today
  assert.equal(judgeAge(2013, 10, 28, now).kind, 'under13') // turns 13 tomorrow
  assert.equal(judgeAge(2008, 10, 27, now).kind, 'adult')   // turns 18 today
  assert.equal(judgeAge(2008, 10, 28, now).kind, 'minor')
})

test('age: impossible dates are invalid', () => {
  const now = new Date(NOW)
  assert.equal(judgeAge(2027, null, null, now).kind, 'invalid') // future
  assert.equal(judgeAge(1800, null, null, now).kind, 'invalid')
  assert.equal(judgeAge(2000, 2, 30, now).kind, 'invalid')
  assert.equal(judgeAge(2000, 5, null, now).kind, 'invalid')    // a month without a day
})
