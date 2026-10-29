import test from 'node:test'
import assert from 'node:assert/strict'
import { sweepUnverified, type SweepDeps, type SweepUser } from './unverifiedSweep.ts'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 20)
/** An account whose grace ended `daysPastGrace` days ago. */
const user = (uid: string, daysPastGrace: number, over: Partial<SweepUser> = {}): SweepUser => ({
  uid, email: `${uid}@example.com`, emailVerified: false, createdMs: NOW - (daysPastGrace + 7) * DAY,
  graceUntil: NOW - daysPastGrace * DAY, apple: false, ...over,
})

function run(users: SweepUser[], over: Partial<SweepDeps> = {}, profiles: Record<string, object> = {}) {
  const calls = { removed: [] as string[], logged: [] as string[], done: [] as string[], reminded: [] as string[], marked: [] as string[] }
  const deps: SweepDeps = {
    now: NOW,
    list: async () => ({ users }),
    profile: async uid => ({ demo: false, name: 'N', level: 'guest', reminded: false, ...(profiles[uid] ?? {}) }),
    remind: async u => { calls.reminded.push(u.uid); return true },
    markReminded: async uid => { calls.marked.push(uid) },
    logDelete: async u => { calls.logged.push(u.uid); return async () => { calls.done.push(u.uid) } },
    remove: async uid => { calls.removed.push(uid) },
    ...over,
  }
  return sweepUnverified(deps).then(out => ({ out, calls }))
}

test('deletes accounts unverified after day 14, logs first, leaves younger and verified ones', async () => {
  const { out, calls } = await run([
    user('old', 7), user('old2', 30), user('locked', 4), user('fresh', -2), user('ok', 20, { emailVerified: true }),
  ])
  assert.deepEqual(calls.removed.sort(), ['old', 'old2'])
  assert.deepEqual(calls.logged.sort(), ['old', 'old2'])
  assert.deepEqual(calls.done.sort(), ['old', 'old2'])
  assert.equal(out.deleted, 2)
})

test('the demo account is never touched', async () => {
  const { calls } = await run([user('demo', 30)], {}, { demo: { demo: true } })
  assert.deepEqual(calls.removed, [])
})

test('reminder goes out once around day 10, only when mail works', async () => {
  const day10 = user('r1', 3.5)
  let { out, calls } = await run([day10, user('r2', 3.5), user('too-early', 2)], {}, { r2: { reminded: true } })
  assert.deepEqual(calls.reminded, ['r1'])
  assert.deepEqual(calls.marked, ['r1'])
  assert.equal(out.reminded, 1)
  ;({ out, calls } = await run([day10], { remind: async () => false })) // no RESEND_API_KEY
  assert.deepEqual(calls.marked, [])
  assert.equal(out.reminded, 0)
})

test('Apple accounts with no school email, and accounts with no email, are skipped; a set school email follows the clock', async () => {
  const { calls } = await run([
    user('apple-none', 30, { apple: true, graceUntil: null, createdMs: NOW - 90 * DAY }),
    user('no-email', 30, { email: null }),
    user('apple-school', 8, { apple: true, createdMs: NOW - 90 * DAY }),
  ])
  assert.deepEqual(calls.removed, ['apple-school'])
})

test('one failing account does not stop the rest, and the cap limits deletes per run', async () => {
  let { out, calls } = await run([user('a', 9), user('b', 9)], { remove: async uid => { if (uid === 'a') throw new Error('boom'); calls0.push(uid) } })
  assert.equal(out.failed, 1)
  assert.equal(out.deleted, 1)
  ;({ out, calls } = await run([user('1', 9), user('2', 9), user('3', 9)], { maxDeletes: 2 }))
  assert.equal(calls.removed.length, 2)
  assert.equal(out.skipped, 1)
})
const calls0: string[] = []

test('walks every page of users', async () => {
  const pages: Record<string, { users: SweepUser[]; next?: string }> = { start: { users: [user('p1', 9)], next: 'two' }, two: { users: [user('p2', 9)] } }
  const { calls } = await run([], { list: async t => pages[t ?? 'start'] })
  assert.deepEqual(calls.removed.sort(), ['p1', 'p2'])
})
