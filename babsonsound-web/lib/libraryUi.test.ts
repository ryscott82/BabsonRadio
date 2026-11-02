import test from 'node:test'
import assert from 'node:assert/strict'
import { ago, busyTypes, changedFields, isLow, progressPct, progressText, statusLine, type WorkerJob, type WorkerProposal } from './libraryUi.ts'

const NOW = 1_800_000_000_000
const job = (over: Partial<WorkerJob>): WorkerJob => ({ id: 'a', type: 'library.scan', params: {}, status: 'queued', createdAt: NOW, startedAt: null, finishedAt: null, progress: { done: 0, total: 0, note: '' }, error: null, ...over })

test('studio PC sentence', () => {
  assert.equal(statusLine({ online: false, lastSeen: NOW - 2 * 86_400_000, version: null, currentJobId: null, liveNow: false }, NOW), 'Studio PC offline, last seen 2 days ago. Jobs wait until it is back.')
  assert.match(statusLine({ online: false, lastSeen: null, version: null, currentJobId: null, liveNow: false }, NOW), /never seen/)
  assert.equal(statusLine({ online: true, lastSeen: NOW, version: '1', currentJobId: null, liveNow: false }, NOW), 'Studio PC online.')
})

test('time ago', () => {
  assert.equal(ago(NOW - 10_000, NOW), 'just now')
  assert.equal(ago(NOW - 5 * 60_000, NOW), '5 minutes ago')
  assert.equal(ago(NOW - 3 * 3_600_000, NOW), '3 hours ago')
})

test('a run button is busy while that kind of job is queued or running', () => {
  const busy = busyTypes([job({ type: 'library.scan', status: 'running' }), job({ type: 'library.fetch_art', status: 'done' }), job({ type: 'library.apply', status: 'queued' })])
  assert.ok(busy.has('library.scan') && busy.has('library.apply'))
  assert.ok(!busy.has('library.fetch_art'))
})

test('progress', () => {
  assert.equal(progressPct(job({ progress: { done: 25, total: 100, note: '' } })), 25)
  assert.equal(progressPct(job({ progress: { done: 5, total: 0, note: '' } })), 0)
  assert.equal(progressText(job({ status: 'running', progress: { done: 25, total: 100, note: 'Fetching' } })), '25 of 100, Fetching')
  assert.equal(progressText(job({ status: 'queued' })), 'Waiting for the studio PC')
})

const prop = (over: Partial<WorkerProposal>): WorkerProposal => ({ songId: '1', current: { title: 'old', artist: 'A', album: '' }, proposed: { title: 'New', artist: 'A', album: 'Alb', confidence: 0.92 }, status: 'pending', beat: null, loudness: null, error: null, updatedAt: 0, ...over })

test('only fields that change are listed; low confidence is under 70%', () => {
  assert.deepEqual(changedFields(prop({})).map(c => c.label), ['Title', 'Album'])
  assert.equal(isLow(prop({})), false)
  assert.equal(isLow(prop({ proposed: { confidence: 0.5 } })), true)
})
