import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE_STATE_DOC, LIVE_STATE_MIN_GAP_MS, applyPushed, estimateReads, liveStateOf, publishDecision, stateHash, wantsPush } from './liveState.ts'
import type { SharedBundle } from './liveBundle.ts'

const NOW = Date.UTC(2026, 10, 8, 15, 0, 0)
const shared = (over: Partial<SharedBundle> = {}): SharedBundle => ({
  at: NOW, presence: { count: 12 },
  skip: { eligible: true, votes: 3, needed: 11, skipped: false },
  vote: { blockStart: NOW, blockEnd: NOW + 3_600_000, threshold: 3, options: [{ label: 'Pop Hits', count: 4 }], winner: null, upNext: null, requestsOpen: false, requestsShow: '' },
  setlist: { occId: 'weekly-A_1760400000000', title: 'Mix', songs: [{ id: 'a', text: 'A', votes: 1 }] },
  rating: { occId: 'weekly-A_1760400000000', count: 5, avg: 4.2 }, ...over,
})

test('the pushed document is skip, vote and set list only: no listener count, no rating, nothing personal', () => {
  const s = liveStateOf(shared())
  assert.deepEqual(Object.keys(s).sort(), ['at', 'setlist', 'skip', 'v', 'vote'])
  assert.equal(JSON.stringify(s).includes('"count":12'), false)
  assert.equal(JSON.stringify(s).includes('4.2'), false)
  assert.deepEqual(LIVE_STATE_DOC, { collection: 'liveState', id: 'current' })
})

test('the same content hashes the same even when the time or the listener count changed', () => {
  const a = stateHash(liveStateOf(shared())), b = stateHash(liveStateOf(shared({ at: NOW + 60_000, presence: { count: 99 } })))
  assert.equal(a, b)
  assert.notEqual(a, stateHash(liveStateOf(shared({ skip: { eligible: true, votes: 4, needed: 11, skipped: false } }))))
})

test('write only when something changed, and at most once per gap; a change inside the gap waits', () => {
  assert.equal(LIVE_STATE_MIN_GAP_MS >= 30_000 && LIVE_STATE_MIN_GAP_MS <= 60_000, true)
  assert.equal(publishDecision('h1', null, NOW), 'write')
  assert.equal(publishDecision('h1', { hash: 'h1', at: NOW - 10 * 60_000 }, NOW), 'same')
  assert.equal(publishDecision('h2', { hash: 'h1', at: NOW - 5_000 }, NOW), 'wait')
  assert.equal(publishDecision('h2', { hash: 'h1', at: NOW - LIVE_STATE_MIN_GAP_MS }, NOW), 'write')
})

test('pushed tallies go on top of the fetched copy, keep the count and rating, and never replace a newer copy', () => {
  const base = shared()
  const p = liveStateOf(shared({ at: NOW + 1000, skip: { eligible: true, votes: 9, needed: 11, skipped: false }, presence: { count: 1 } }))
  const out = applyPushed(base, p)!
  assert.equal(out.skip.votes, 9)
  assert.equal(out.presence.count, 12)
  assert.equal(out.rating?.avg, 4.2)
  assert.equal(out.at, NOW + 1000)
  assert.equal(applyPushed(base, liveStateOf(shared({ at: NOW - 5000 }))), base)
  assert.equal(applyPushed(base, null), base)
  assert.equal(applyPushed(null, p), null)
})

test('a page listens only while visible, signed in, and showing a skip button, vote card or set list', () => {
  assert.equal(wantsPush({ visible: true, signedIn: true, subscribers: 1 }), true)
  assert.equal(wantsPush({ visible: false, signedIn: true, subscribers: 1 }), false)
  assert.equal(wantsPush({ visible: true, signedIn: false, subscribers: 1 }), false)
  assert.equal(wantsPush({ visible: true, signedIn: true, subscribers: 0 }), false)
})

test('read estimate: listeners x (changes + one attach) x hours', () => {
  assert.equal(estimateReads({ listeners: 50, changesPerHour: 10, hours: 1 }), 550)
  assert.equal(estimateReads({ listeners: 50, changesPerHour: 10, hours: 2, reattachPerListenerPerHour: 3 }), 1300)
  assert.equal(estimateReads({ listeners: 0, changesPerHour: 10, hours: 5 }), 0)
})
