import test from 'node:test'
import assert from 'node:assert/strict'
import { sweepUnverified, type SweepDeps, type SweepUser } from './unverifiedSweep.ts'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 20)
/** An account whose grace ended `daysPastGrace` days ago. */
const user = (uid: string, daysPastGrace: number, over: Partial<SweepUser> = {}): SweepUser => ({
  uid, email: `${uid}@example.com`, emailVerified: false, createdMs: NOW - (daysPastGrace + 7) * DAY,
  graceUntil: NOW - daysPastGrace * DAY, ...over,
})

function run(users: SweepUser[], over: Partial<SweepDeps> = {}, profiles: Record<string, object> = {}) {
  const calls = { reminded: [] as string[], marked: [] as string[] }
  const deps: SweepDeps = {
    now: NOW,
    list: async () => ({ users }),
    profile: async uid => ({ demo: false, name: 'N', level: 'guest', reminded: false, ...(profiles[uid] ?? {}) }),
    remind: async u => { calls.reminded.push(u.uid); return true },
    markReminded: async uid => { calls.marked.push(uid) },
    ...over,
  }
  return sweepUnverified(deps).then(out => ({ out, calls }))
}

test('never deletes: long-unverified accounts are only reminded, and the sweep has no way to remove one', async () => {
  const { out, calls } = await run([user('old', 30), user('older', 90), user('ok', 20, { emailVerified: true })], {}, { old: { reminded: true }, older: { reminded: true } })
  assert.deepEqual(calls.reminded, [])
  assert.equal('deleted' in out, false)
})

test('the demo account is never reminded', async () => {
  const { calls } = await run([user('demo', 3.5)], {}, { demo: { demo: true } })
  assert.deepEqual(calls.reminded, [])
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

test('accounts with no email are skipped; an account with no claim follows 7 days from creation', async () => {
  const { calls } = await run([
    user('no-email', 3.5, { email: null }),
    user('no-claim', 3.5, { graceUntil: null, createdMs: NOW - 10.5 * DAY }),
  ])
  assert.deepEqual(calls.reminded, ['no-claim'])
})

test('one failing account does not stop the rest', async () => {
  const { out, calls } = await run([user('a', 3.5), user('b', 3.5)], { remind: async u => { if (u.uid === 'a') throw new Error('boom'); calls0.push(u.uid); return true } })
  assert.equal(out.failed, 1)
  assert.equal(out.reminded, 1)
  assert.deepEqual(calls0, ['b'])
  assert.deepEqual(calls.reminded, [])
})
const calls0: string[] = []

test('walks every page of users', async () => {
  const pages: Record<string, { users: SweepUser[]; next?: string }> = { start: { users: [user('p1', 3.5)], next: 'two' }, two: { users: [user('p2', 3.5)] } }
  const { calls } = await run([], { list: async t => pages[t ?? 'start'] })
  assert.deepEqual(calls.reminded.sort(), ['p1', 'p2'])
})
