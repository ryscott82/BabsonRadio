import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanJobParams, planApply, planUndo, sortKeyOf } from '../src/rules.mjs'

test('params: allowlist, types and limits', () => {
  assert.deepEqual(cleanJobParams('library.scan', {}), { ok: true, params: {} })
  assert.equal(cleanJobParams('rm -rf', {}).ok, false)
  assert.equal(cleanJobParams('library.scan', { full: 'yes' }).ok, false)
  assert.equal(cleanJobParams('library.fetch_art', { songIds: ['1', '2'], cmd: 'x' }).ok, false)
  assert.equal(cleanJobParams('library.fetch_art', { songIds: ['../etc'] }).ok, false)
  assert.equal(cleanJobParams('library.measure_loudness', { targetLufs: -40 }).ok, false)
  assert.deepEqual(cleanJobParams('library.apply', { kinds: ['art', 'art'] }), { ok: true, params: { kinds: ['art'] } })
  assert.equal(cleanJobParams('library.undo', {}).ok, false)
})

test('apply plans only approved proposals', () => {
  const base = { songId: '7', current: { title: 'ivy', artist: 'frank ocean', album: '' }, proposed: { title: 'Ivy', artist: 'Frank Ocean', album: 'Blonde', artUrl: 'https://x/y.jpg', confidence: 0.9, source: 'itunes' }, loudness: { lufs: -10, gainDb: -4.04 }, beat: { bpm: 120, firstBeat: 0.5 } }
  assert.deepEqual(planApply([{ ...base, status: 'pending' }]), [])
  assert.deepEqual(planApply([{ ...base, status: 'rejected' }]), [])
  const plan = planApply([{ ...base, status: 'approved' }])
  assert.deepEqual(plan.map(p => p.kind), ['metadata', 'art', 'amplify', 'beat'])
  assert.equal(plan[2].changes[0].new, -4)
  assert.equal(plan[3].artist, 'Frank Ocean')
  assert.equal(planApply([{ ...base, status: 'approved', proposed: { ...base.proposed, artUrl: 'javascript:alert(1)' } }], ['art']).length, 0)
})

test('undo: newest first, once, never undo records', () => {
  const ch = [
    { id: 'a', songId: '1', field: 'title', old: 'x', new: 'y', at: 1, jobId: 'j' },
    { id: 'b', songId: '1', field: 'title', old: 'y', new: 'z', at: 2, jobId: 'j' },
    { id: 'undo_a', songId: '1', field: 'title', old: 'y', new: 'x', at: 3, jobId: 'k', undoOf: 'a' },
  ]
  assert.deepEqual(planUndo(ch, { jobId: 'j' }).map(s => s.changeId), ['b'])
  assert.equal(sortKeyOf('Beyoncé', 'Halo!'), 'beyonce|halo')
})
