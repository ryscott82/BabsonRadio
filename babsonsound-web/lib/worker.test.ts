import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JOB_TYPES, beatShard, changeRefusal, cleanJobParams, cleanProposalFields, isJobType, nonceFresh, planApply, planUndo, searchPrefix,
  sortKeyOf, undoRecordId, verifyWorkerSig, workerSig, type Change, type Proposal,
} from './worker.ts'

const SECRET = 'x'.repeat(40)
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)

test('only the allowlisted job types pass', () => {
  assert.equal(JOB_TYPES.length, 8)
  for (const t of JOB_TYPES) assert.ok(isJobType(t))
  for (const t of ['library.delete', 'library', 'schedule.rebuild', '', 'LIBRARY.SCAN', 'library.scan ', 5, null, undefined, {}]) assert.equal(isJobType(t), false, String(t))
})

test('job params: unknown keys, wrong types and oversize lists are refused; clean ones are copied', () => {
  assert.deepEqual(cleanJobParams('library.scan', undefined), { ok: true, params: {} })
  assert.deepEqual(cleanJobParams('library.scan', { full: true }), { ok: true, params: { full: true } })
  assert.equal(cleanJobParams('library.scan', { full: 'yes' }).ok, false)
  assert.equal(cleanJobParams('library.scan', { evil: 1 }).ok, false)
  assert.equal(cleanJobParams('schedule.reconcile', { anything: 1 }).ok, false)
  assert.equal(cleanJobParams('library.scan', [1]).ok, false)
  assert.deepEqual(cleanJobParams('library.fetch_art', { songIds: [1, 'a'] }), { ok: true, params: { songIds: ['1', 'a'] } })
  assert.equal(cleanJobParams('library.fetch_art', { songIds: new Array(5001).fill('a') }).ok, false)
  assert.equal(cleanJobParams('library.fetch_art', { songIds: [{}] }).ok, false)
  assert.equal(cleanJobParams('library.measure_loudness', { targetLufs: -3 }).ok, false)
  assert.deepEqual(cleanJobParams('library.measure_loudness', { targetLufs: -14 }), { ok: true, params: { targetLufs: -14 } })
  assert.equal(cleanJobParams('library.apply', { kinds: ['delete'] }).ok, false)
  assert.deepEqual(cleanJobParams('library.apply', { kinds: ['art', 'art'], proposalIds: ['p1'] }), { ok: true, params: { proposalIds: ['p1'], kinds: ['art'] } })
  assert.equal(cleanJobParams('library.undo', {}).ok, false) // must say what to undo
  assert.equal(cleanJobParams('library.undo', { jobId: 'j1' }).ok, true)
  assert.equal(cleanJobParams('library.undo', { changeIds: ['c1'] }).ok, true)
})

test('worker signature: right secret and fresh nonce pass; wrong secret, old nonce, forged or malformed fail', () => {
  const nonce = `${NOW}.abcdEFGH1234`
  const sig = workerSig(SECRET, nonce)
  assert.ok(verifyWorkerSig(SECRET, nonce, sig, NOW))
  assert.ok(verifyWorkerSig(SECRET, nonce, sig, NOW + 119_000))
  assert.equal(verifyWorkerSig(SECRET, nonce, sig, NOW + 121_000), false) // older than 2 minutes
  assert.equal(verifyWorkerSig(SECRET, nonce, sig, NOW - 121_000), false) // from the future
  assert.equal(verifyWorkerSig('y'.repeat(40), nonce, sig, NOW), false)
  assert.equal(verifyWorkerSig(SECRET, `${NOW}.otherNONCE99`, sig, NOW), false) // signature is for another nonce
  assert.equal(verifyWorkerSig(SECRET, nonce, 'z'.repeat(64), NOW), false)
  assert.equal(verifyWorkerSig(SECRET, nonce, sig.slice(0, 60), NOW), false)
  assert.equal(verifyWorkerSig(SECRET, 'not-a-nonce', sig, NOW), false)
  assert.equal(verifyWorkerSig('short', nonce, workerSig('short', nonce), NOW), false) // secrets under 32 characters never work
  assert.equal(verifyWorkerSig('', nonce, workerSig('', nonce), NOW), false)
})

test('a nonce works once inside the window', () => {
  const seen = new Map<string, number>()
  assert.ok(nonceFresh(seen, 'n1', NOW))
  assert.equal(nonceFresh(seen, 'n1', NOW + 1000), false)
  assert.ok(nonceFresh(seen, 'n2', NOW + 1000))
  assert.ok(nonceFresh(seen, 'n1', NOW + 10 * 60_000)) // forgotten after the window (the signature check rejects it as too old anyway)
})

const tags = { title: 'Old', artist: 'Art', album: 'Alb' }
const prop = (status: Proposal['status'], over: Partial<Proposal> = {}): Proposal => ({
  songId: `s-${status}`, current: tags, status,
  proposed: { title: 'New', artist: 'Art', album: 'Alb', artUrl: 'https://img.example/a.jpg', confidence: 0.95, source: 'musicbrainz' },
  loudness: { lufs: -18, gainDb: 4 }, beat: { bpm: 120, firstBeat: 0.3 }, ...over,
})

test('apply only ever plans approved proposals', () => {
  const all = (['pending', 'approved', 'rejected', 'applied', 'failed'] as const).map(s => prop(s))
  const plan = planApply(all)
  assert.ok(plan.length > 0)
  assert.ok(plan.every(a => a.songId === 's-approved'))
  assert.deepEqual(plan.map(a => a.kind).sort(), ['amplify', 'art', 'beat', 'metadata'])
  assert.deepEqual(planApply(all.filter(p => p.status !== 'approved')), [])
})

test('apply plans only what changes, and only the kinds asked for', () => {
  const p = prop('approved', { proposed: { title: 'Old', artist: 'Art', album: 'Alb', confidence: 1, source: 'x' }, loudness: undefined, beat: undefined })
  assert.deepEqual(planApply([p]), []) // nothing differs, no art, no gain
  const q = prop('approved')
  assert.deepEqual(planApply([q], ['art']).map(a => a.kind), ['art'])
  assert.deepEqual(planApply([q], ['metadata'])[0].changes, [{ field: 'title', new: 'New' }])
  assert.deepEqual(planApply([prop('approved', { loudness: { lufs: -40, gainDb: 99 } })], ['amplify']), []) // absurd gain is ignored
  assert.deepEqual(planApply([prop('approved', { proposed: { ...tags, artUrl: 'http://insecure/a.jpg', confidence: 1, source: 'x' } })], ['art']), []) // https only
})

test('the server refuses change reports that are not allowed', () => {
  const apply = { type: 'library.apply', status: 'running' }
  assert.equal(changeRefusal(apply, { field: 'title' }, 'approved'), null)
  assert.equal(changeRefusal(apply, { field: 'title' }, 'applied'), null)
  for (const s of ['pending', 'rejected', 'failed', undefined]) assert.match(changeRefusal(apply, { field: 'title' }, s) ?? '', /approved proposal/)
  assert.match(changeRefusal({ ...apply, status: 'done' }, { field: 'title' }, 'approved') ?? '', /not running/)
  assert.match(changeRefusal({ ...apply, status: 'cancelled' }, { field: 'title' }, 'approved') ?? '', /not running/)
  assert.match(changeRefusal(apply, { field: 'password' }, 'approved') ?? '', /Unknown field/)
  assert.match(changeRefusal(apply, { field: 'beat' }, 'approved') ?? '', /artist and title/)
  assert.equal(changeRefusal(apply, { field: 'beat', artist: 'A', title: 'T' }, 'approved'), null)
  assert.match(changeRefusal(apply, { field: 'title', undoOf: 'c1' }, 'approved') ?? '', /cannot undo/)
  for (const t of ['library.scan', 'library.fetch_art', 'library.analyze_beats', 'library.measure_loudness', 'schedule.reconcile']) assert.match(changeRefusal({ type: t, status: 'running' }, { field: 'title' }, 'approved') ?? '', /does not change/)
})

const ch = (id: string, at: number, over: Partial<Change> = {}): Change => ({ id, songId: 's1', field: 'title', old: `old${id}`, new: `new${id}`, by: 'studio-worker', at, jobId: 'j1', ...over })

test('undo plans the newest change first, restores the old value, and skips changes already undone', () => {
  const log = [ch('c1', 1), ch('c2', 2, { field: 'album' }), ch('c3', 3, { jobId: 'j2' }), ch('u1', 4, { undoOf: 'c1' })]
  assert.deepEqual(planUndo(log, { jobId: 'j1' }).map(s => s.changeId), ['c2']) // c1 is already undone
  assert.deepEqual(planUndo(log, { jobId: 'j2' }).map(s => [s.changeId, s.restore]), [['c3', 'oldc3']])
  assert.deepEqual(planUndo(log, { changeIds: ['c2', 'c3'] }).map(s => s.changeId), ['c3', 'c2'])
  assert.deepEqual(planUndo(log, { changeIds: ['u1'] }), []) // undo records are not undone
  assert.deepEqual(planUndo(log, { changeIds: ['c1'] }), [])
})

test('undo restores beat entries with their artist and title', () => {
  const [s] = planUndo([ch('b1', 1, { field: 'beat', old: [120, 0.2], new: [128, 0.1], artist: 'A', title: 'T' })], { changeIds: ['b1'] })
  assert.deepEqual(s, { changeId: 'b1', songId: 's1', field: 'beat', restore: [120, 0.2], artist: 'A', title: 'T' })
  assert.equal(undoRecordId('b1'), 'undo_b1')
})

test('proposal edits: allowed fields only, text trimmed, art must be https', () => {
  assert.deepEqual(cleanProposalFields({ title: '  Hi  ', album: '' }), { ok: true, fields: { title: 'Hi', album: '' } })
  assert.equal(cleanProposalFields({ title: '' }).ok, false)
  assert.equal(cleanProposalFields({ status: 'approved' }).ok, false)
  assert.equal(cleanProposalFields({ confidence: 1 }).ok, false)
  assert.equal(cleanProposalFields({ artUrl: 'http://x/a.jpg' }).ok, false)
  assert.equal(cleanProposalFields({ artUrl: 'javascript:alert(1)' }).ok, false)
  assert.deepEqual(cleanProposalFields({ artUrl: 'https://x/a.jpg' }), { ok: true, fields: { artUrl: 'https://x/a.jpg' } })
  assert.equal(cleanProposalFields({}).ok, false)
  assert.equal(cleanProposalFields([]).ok, false)
  assert.equal(cleanProposalFields({ title: 5 }).ok, false)
})

test('search keys and beat shards', () => {
  assert.equal(sortKeyOf('Beyoncé', 'Halo!'), 'beyonce|halo')
  assert.equal(searchPrefix('  Beyonc'), 'beyonc')
  assert.equal(searchPrefix('Beyoncé | Ha'), 'beyonce|ha')
  assert.equal(beatShard('beyonce|halo'), 'b')
  assert.equal(beatShard('7rings|x'), '7')
  assert.equal(beatShard('|x'), '_')
})
