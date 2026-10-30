// Run with:  npm test   (Node's built-in test runner; no extra packages)
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupState, stepsFor, type SetupInput } from './setup.ts'
import { judgeAge } from './age.ts'
import { gradYearOptions, guessGradYear, validGradYear } from './terms.ts'

const NOW = Date.UTC(2026, 9, 27, 15, 0, 0) // Oct 27, 2026
const MIN = 60_000, DAY = 24 * 60 * MIN

/** A student who is verified but has done nothing else. */
const base = (over: Partial<SetupInput> = {}): SetupInput => ({
  level: 'student', demo: false, emailVerified: true, graceUntil: null, joinedAt: NOW - DAY,
  firstName: '', avatarChosen: false, birthdayDone: false, gradYear: '', hasPhone: false, hasInstagram: false, skips: {}, ...over,
})

test('steps come in order: name first, pick your color last', () => {
  const s = setupState(base({ emailVerified: false }), NOW)
  assert.deepEqual(s.steps.map(x => x.id), ['verifyEmail', 'name', 'birthday', 'gradYear', 'phone', 'instagram', 'avatar'])
  assert.equal(s.next, 'name') // verifying the email has its own banner; it is never the prompt
  assert.equal(setupState(base({ firstName: 'Ryan' }), NOW).next, 'birthday')
  assert.equal(setupState(base({ firstName: 'Ryan', birthdayDone: true }), NOW).next, 'gradYear')
  assert.equal(setupState(base({ firstName: 'Ryan', birthdayDone: true, gradYear: '2028', hasPhone: true, hasInstagram: true }), NOW).next, 'avatar')
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

test('a dismissed step goes to the back and comes around again', () => {
  const skip = (id: string, at: number) => ({ [id]: { count: 1, lastShownAt: at, lastSkippedAt: at } })
  const named = { firstName: 'R' }
  assert.equal(setupState(base(named), NOW).next, 'birthday')
  assert.equal(setupState(base({ ...named, skips: skip('birthday', NOW - MIN) }), NOW).next, 'gradYear')
  assert.equal(setupState(base({ ...named, skips: { ...skip('birthday', NOW - 3 * MIN), ...skip('gradYear', NOW - 2 * MIN), ...skip('phone', NOW - MIN) } }), NOW).next, 'instagram')
  // everything left has been dismissed: the one dismissed longest ago comes first
  const all = { ...named, birthdayDone: false, skips: { ...skip('birthday', NOW - 9 * MIN), ...skip('gradYear', NOW - 8 * MIN), ...skip('phone', NOW - 7 * MIN), ...skip('instagram', NOW - 6 * MIN), ...skip('avatar', NOW - 5 * MIN) } }
  assert.equal(setupState(base(all), NOW).next, 'birthday')
})

test('the name is required and cannot be passed over', () => {
  const skipped = { name: { count: 5, lastShownAt: NOW - MIN, lastSkippedAt: NOW - MIN } }
  assert.equal(setupState(base({ skips: skipped }), NOW).next, 'name')
  assert.deepEqual(setupState(base(), NOW).steps.filter(x => x.required).map(x => x.id), ['verifyEmail', 'name'])
})

test('there is no wait between prompts: a new visit always gets the next step', () => {
  assert.equal(setupState(base(), NOW).next, 'name')
  assert.equal(setupState(base({ firstName: 'R' }), NOW + 1).next, 'birthday')
})

test('the grad year guess is passed along', () => {
  assert.equal(setupState(base({ gradGuess: '2029' }), NOW).gradGuess, '2029')
  assert.equal(setupState(base(), NOW).gradGuess, null)
})

test('graduation choices follow the school year', () => {
  const oct26 = new Date(2026, 9, 30), may27 = new Date(2027, 4, 1), aug27 = new Date(2027, 7, 1)
  assert.deepEqual(gradYearOptions(oct26).map(o => o.value), ['2027', '2028', '2029', '2030', 'prospective', 'alumni', 'staff'])
  assert.deepEqual(gradYearOptions(may27).slice(0, 4).map(o => o.value), ['2027', '2028', '2029', '2030'])
  assert.deepEqual(gradYearOptions(aug27).slice(0, 4).map(o => o.value), ['2028', '2029', '2030', '2031'])
  assert.equal(validGradYear('2030', oct26), true)
  assert.equal(validGradYear('2031', oct26), false)
  assert.equal(validGradYear('prospective', oct26), true)
})

test('guessing a graduation year from a birthday', () => {
  const oct26 = new Date(2026, 9, 30)
  assert.equal(guessGradYear(2008, null, oct26), '2030')
  assert.equal(guessGradYear(2008, 3, oct26), '2030')
  assert.equal(guessGradYear(2007, 10, oct26), '2030') // fall birthday: a year later
  assert.equal(guessGradYear(2005, 5, oct26), '2027')
  assert.equal(guessGradYear(2003, 5, oct26), '2027') // a 5th year or late finisher: this year's class
  assert.equal(guessGradYear(2009, 4, oct26), 'prospective')
  assert.equal(guessGradYear(1990, 4, oct26), '')
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
  // the same person as a student is asked for graduation year, then phone
  assert.equal(setupState(base({ ...done, level: 'student' }), NOW).next, 'gradYear')
  assert.equal(setupState(base({ ...done, level: 'student', gradYear: '2028' }), NOW).next, 'phone')
  assert.equal(setupState(base({ ...done, level: 'student', gradYear: '2028', hasPhone: true }), NOW).next, 'instagram')
  assert.equal(stepsFor('student').at(-1), 'avatar')
  assert.equal(stepsFor('guest').includes('instagram'), false)
  assert.equal(stepsFor('guest').includes('phone'), false)
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
