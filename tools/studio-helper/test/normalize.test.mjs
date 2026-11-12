import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeOne } from '../lib/normalize.mjs'

// A pretend runTool with the same handler protocol as tools/pc-worker/src/python.mjs.
function fakeRunTool(log, { gain = -3.5, goLiveAt = '' } = {}) {
  return async (cfg, script, args, h) => {
    const mode = args.includes('--measure') ? 'measure' : 'plan'
    log.push({ script, mode, args, file: JSON.parse(readFileSync(args[args.indexOf(mode === 'measure' ? '--ids' : '--plan') + 1], 'utf8')) })
    if (goLiveAt === mode) cfg.live.v = true
    if ((await h.next({ t: 'next' })) !== 'go') return { code: 0, tail: [] }
    if (mode === 'measure') await h.result({ id: '42', loudness: { gainDb: gain } })
    else if ((await h.change({ t: 'change' })) !== 'go') return { code: 0, tail: [] }
    return { code: 0, tail: [] }
  }
}

test('measures then sets Amplify for that one file', async () => {
  const log = [], live = { v: false }
  const r = await normalizeOne(42, { runTool: fakeRunTool(log), cfg: { live }, isLive: async () => live.v })
  assert.equal(r, 'done')
  assert.deepEqual(log.map(l => l.mode), ['measure', 'plan'])
  assert.deepEqual(log[0].file, ['42'])
  assert.deepEqual(log[1].file, [{ songId: '42', amplify: -3.5 }])
  assert.ok(log[1].args.includes('--apply'))
})

test('never starts while live, and stops if a show goes live midway', async () => {
  const log = [], live = { v: true }
  assert.equal(await normalizeOne(42, { runTool: fakeRunTool(log), cfg: { live }, isLive: async () => live.v }), 'later')
  assert.equal(log.length, 0)
  live.v = false
  assert.equal(await normalizeOne(42, { runTool: fakeRunTool(log, { goLiveAt: 'plan' }), cfg: { live }, isLive: async () => live.v }), 'later')
})
