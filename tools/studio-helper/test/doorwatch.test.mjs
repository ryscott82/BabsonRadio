import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDoorWatch } from '../lib/doorwatch.mjs'

function setup(o = {}) {
  let t = 1_800_000_000_000, toasts = 0
  const st = { booth: o.booth ?? false, maint: o.maint ?? false }
  const w = createDoorWatch({ now: () => t, boothRunning: async () => st.booth, maintenance: () => st.maint, toast: async () => { toasts++ } })
  return { w, st, add: ms => { t += ms }, now: () => t, toasts: () => toasts }
}

test('the scan that is already there at start is ignored; a new one shows the notice once', async () => {
  const s = setup()
  assert.equal(await s.w.onPing({ claimId: 'a', at: s.now() - 5000 }), 'baseline')
  assert.equal(await s.w.onPing({ claimId: 'a', at: s.now() - 5000 }), 'same')
  assert.equal(await s.w.onPing({ claimId: 'b', at: s.now() }), 'toast')
  assert.equal(await s.w.onPing({ claimId: 'b', at: s.now() }), 'same', 'once per scan')
  assert.equal(s.toasts(), 1)
})

test('no notice while the booth is up, in maintenance mode, or for an old scan', async () => {
  const s = setup({ booth: true })
  await s.w.onPing(undefined)
  assert.equal(await s.w.onPing({ claimId: 'c', at: s.now() }), 'booth-up')
  s.st.booth = false; s.st.maint = true
  assert.equal(await s.w.onPing({ claimId: 'd', at: s.now() }), 'maintenance')
  s.st.maint = false
  assert.equal(await s.w.onPing({ claimId: 'e', at: s.now() - 61_000 }), 'old')
  assert.equal(await s.w.onPing({ claimId: 'f', at: s.now() - 1000 }), 'toast')
  assert.equal(s.toasts(), 1)
})

test('if the booth check fails it assumes the booth is up (never a stray notice)', async () => {
  let toasts = 0
  const w = createDoorWatch({ now: () => 10_000, boothRunning: async () => { throw new Error('no powershell') }, maintenance: () => false, toast: async () => { toasts++ } })
  await w.onPing(undefined)
  assert.equal(await w.onPing({ claimId: 'x', at: 9_000 }), 'booth-up')
  assert.equal(toasts, 0)
})
