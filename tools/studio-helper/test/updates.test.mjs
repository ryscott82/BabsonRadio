import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUpdates } from '../lib/updates.mjs'

const make = (o = {}) => {
  const calls = { git: [], run: 0 }
  const u = createUpdates({
    now: () => 1000,
    git: async args => { calls.git.push(args.join(' ')); if (o.fail) throw new Error('could not reach github'); return args[0] === 'rev-list' ? `${o.behind ?? 0}\n` : '' },
    busy: async () => o.busy || '',
    runUpdate: () => { calls.run++ },
  })
  return { u, calls }
}

test('check counts new helper commits on GitHub, only under tools/studio-helper', async () => {
  const { u, calls } = make({ behind: 3 })
  assert.deepEqual(await u.check(), { behind: 3, checkedAt: 1000, error: '', updating: false })
  assert.equal(calls.git[0], 'fetch -q origin main')
  assert.equal(calls.git[1], 'rev-list --count HEAD..origin/main -- tools/studio-helper')
})

test('a failed check keeps the last count and says why', async () => {
  const { u } = make({ fail: true })
  const s = await u.check()
  assert.equal(s.behind, 0)
  assert.match(s.error, /github/)
})

test('update does nothing when there is nothing new', async () => {
  const { u, calls } = make({ behind: 0 })
  assert.deepEqual(await u.update(), { ok: true, nothing: true })
  assert.equal(calls.run, 0)
})

test('update refuses during a live show or recording', async () => {
  const { u, calls } = make({ behind: 2, busy: 'A show is live. Update after it ends.' })
  assert.deepEqual(await u.update(), { error: 'A show is live. Update after it ends.' })
  assert.equal(calls.run, 0)
  assert.equal(u.state().updating, false)
})

test('update runs the update script once', async () => {
  const { u, calls } = make({ behind: 2 })
  assert.deepEqual(await u.update(), { ok: true })
  assert.equal(u.state().updating, true)
  assert.deepEqual(await u.update(), { ok: true, already: true })
  assert.equal(calls.run, 1)
})
