import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LISTEN_BEAT_MS, OCC, PERSONAL_MS, PRIVATE_CACHE, RESUME_MIN_AGE_MS, SECTIONS, SHARED_CACHE, SHARED_MS,
  cacheControlFor, cleanOcc, dueFor, newerShared, occRateable, pollAllowed, ratingView, sectionsOf, skipView, songsView, voteView, wantOf,
  type MeBundle, type SharedBundle,
} from './liveBundle.ts'

const NOW = Date.UTC(2026, 10, 8, 15, 0, 0)
const OCC_ID = `weekly-Abc123_${NOW - 20 * 60_000}`

const shared = (over: Partial<SharedBundle> = {}): SharedBundle => ({
  at: NOW,
  presence: { count: 12 },
  skip: { eligible: true, votes: 3, needed: 11, skipped: false },
  vote: {
    blockStart: NOW + 3_600_000, blockEnd: NOW + 7_200_000, threshold: 3, options: [{ label: 'Pop Hits', count: 4 }, { label: 'Acoustic', count: 1 }],
    winner: null, upNext: { blockStart: NOW, label: 'Lofi Beats' }, requestsOpen: true, requestsShow: 'Friday Mix',
  },
  setlist: { occId: OCC_ID, title: 'Friday Mix', songs: [{ id: 'a', text: 'Song A', votes: 2 }, { id: 'b', text: 'Song B', votes: 0 }] },
  rating: { occId: OCC_ID, count: 5, avg: 4.2 },
  ...over,
})
const me = (over: Partial<MeBundle> = {}): MeBundle => ({
  at: NOW, skip: { mine: true }, vote: { myVote: 'Pop Hits', canVote: true }, setlist: { occId: OCC_ID, mine: ['b'] }, rating: { occId: OCC_ID, mine: 4 }, ...over,
})

test('the shared half is public and cached for 10 to 30 s with stale-while-revalidate; your half is never cached', () => {
  const m = /s-maxage=(\d+)/.exec(SHARED_CACHE)
  assert.ok(m && Number(m[1]) >= 10 && Number(m[1]) <= 30)
  assert.match(SHARED_CACHE, /^public/)
  assert.match(SHARED_CACHE, /stale-while-revalidate=\d+/)
  assert.equal(PRIVATE_CACHE, 'private, no-store')
  assert.equal(cacheControlFor('shared'), SHARED_CACHE)
  assert.equal(cacheControlFor('me'), PRIVATE_CACHE)
  assert.equal(cacheControlFor('full'), PRIVATE_CACHE)
})

test('which half is sent: explicit part wins; no part means everything with a sign-in header, shared without one', () => {
  assert.equal(wantOf('shared', true), 'shared')
  assert.equal(wantOf('shared', false), 'shared')
  assert.equal(wantOf('me', true), 'me')
  assert.equal(wantOf('me', false), 'me') // the route then asks for sign-in
  assert.equal(wantOf(null, true), 'full')
  assert.equal(wantOf(null, false), 'shared')
  assert.equal(wantOf('banana', true), 'full')
  assert.equal(wantOf('banana', false), 'shared')
})

test('sections: only known names, in a fixed order; nothing valid means all', () => {
  assert.deepEqual(sectionsOf(null), [...SECTIONS])
  assert.deepEqual(sectionsOf(''), [...SECTIONS])
  assert.deepEqual(sectionsOf('host'), ['host'])
  assert.deepEqual(sectionsOf('vote,skip,nope'), ['skip', 'vote'])
  assert.deepEqual(sectionsOf('nope,../x'), [...SECTIONS])
})

test('occId: only real show ids pass; anything else is ignored so junk cannot make work or cache entries', () => {
  assert.equal(cleanOcc(OCC_ID), OCC_ID)
  assert.equal(cleanOcc('genre-Hip-Hop & R&B_1760400000000'), 'genre-Hip-Hop & R&B_1760400000000')
  for (const bad of ['', 'x', 'weekly-a_b', 'weekly-a/b_1760400000000', `weekly-${'a'.repeat(120)}_1760400000000`, null, undefined, 5, ['weekly-a_1760400000000']]) assert.equal(cleanOcc(bad), '')
  assert.ok(OCC.test(OCC_ID))
})

test('a show can be rated from its start until 12 hours later, never before it starts', () => {
  assert.ok(occRateable(OCC_ID, NOW))
  assert.equal(occRateable(`weekly-Abc123_${NOW + 1000}`, NOW), false)
  assert.equal(occRateable(`weekly-Abc123_${NOW - 13 * 3_600_000}`, NOW), false)
  assert.equal(occRateable('nonsense', NOW), false)
})

test('skip view: the tally is shared, "mine" is yours; nothing until the shared half has arrived', () => {
  assert.equal(skipView(null, me()), null)
  assert.deepEqual(skipView(shared(), me()), { votes: 3, needed: 11, eligible: true, mine: true })
  assert.deepEqual(skipView(shared(), null), { votes: 3, needed: 11, eligible: true, mine: false })
  assert.equal(skipView(shared(), me({ skip: null }))?.mine, false)
})

test('vote view needs both halves and joins the shared tally with your pick', () => {
  assert.equal(voteView(null, me()), null)
  assert.equal(voteView(shared(), null), null)
  assert.equal(voteView(shared(), me({ vote: null })), null)
  const v = voteView(shared(), me())!
  assert.equal(v.myVote, 'Pop Hits')
  assert.equal(v.canVote, true)
  assert.equal(v.options[0].count, 4)
  assert.equal(v.requestsOpen, true)
  assert.equal(voteView(shared(), me({ vote: { myVote: null, canVote: false } }))!.canVote, false)
})

test('set list: votes are shared, your marks are yours, and marks for a different show are ignored', () => {
  const v = songsView(shared(), me())
  assert.equal(v.title, 'Friday Mix')
  assert.deepEqual(v.songs.map(s => [s.id, s.votes, s.mine]), [['a', 2, false], ['b', 0, true]])
  assert.ok(songsView(shared(), me({ setlist: { occId: 'weekly-Other_1760400000000', mine: ['a', 'b'] } })).songs.every(s => !s.mine))
  assert.ok(songsView(shared(), null).songs.every(s => !s.mine))
  assert.deepEqual(songsView(null, null), { title: '', songs: [] })
})

test('rating view: average and count from the shared half, your stars from yours, only for the same show', () => {
  assert.deepEqual(ratingView(shared(), me(), OCC_ID), { avg: 4.2, count: 5, mine: 4 })
  assert.deepEqual(ratingView(shared(), me(), 'weekly-Other_1760400000000'), { avg: 0, count: 0, mine: 0 })
  assert.deepEqual(ratingView(shared({ rating: null }), me(), OCC_ID), { avg: 0, count: 0, mine: 4 })
  assert.deepEqual(ratingView(null, null, OCC_ID), { avg: 0, count: 0, mine: 0 })
})

test('timing: listening check-in every 60 s, shared half every 30 s, your half every 2 minutes', () => {
  assert.equal(LISTEN_BEAT_MS, 60_000)
  assert.ok(SHARED_MS >= 30_000)
  assert.ok(PERSONAL_MS >= 2 * SHARED_MS)
  assert.ok(RESUME_MIN_AGE_MS < SHARED_MS)
})

test('hidden tabs do not poll; the listening check-in is the one thing that goes on, and only while audio plays', () => {
  assert.equal(pollAllowed({ hidden: false, playing: false, kind: 'poll' }), true)
  assert.equal(pollAllowed({ hidden: false, playing: true, kind: 'beat' }), true)
  assert.equal(pollAllowed({ hidden: true, playing: false, kind: 'poll' }), false)
  assert.equal(pollAllowed({ hidden: true, playing: true, kind: 'poll' }), false) // playing does not make the page polls resume
  assert.equal(pollAllowed({ hidden: true, playing: true, kind: 'beat' }), true)
  assert.equal(pollAllowed({ hidden: true, playing: false, kind: 'beat' }), false)
})

test('when a part is due: never while hidden; after its interval; a returning tab refreshes after 10 s', () => {
  assert.equal(dueFor(Infinity, SHARED_MS, { hidden: true }), false)
  assert.equal(dueFor(29_999, SHARED_MS, { hidden: false }), false)
  assert.equal(dueFor(30_000, SHARED_MS, { hidden: false }), true)
  assert.equal(dueFor(Infinity, PERSONAL_MS, { hidden: false }), true)
  assert.equal(dueFor(60_000, PERSONAL_MS, { hidden: false }), false)
  assert.equal(dueFor(60_000, PERSONAL_MS, { hidden: false, resumed: true }), true) // back after a minute away
  assert.equal(dueFor(5_000, PERSONAL_MS, { hidden: false, resumed: true }), false) // but not if it just refreshed
  assert.equal(dueFor(60_000, PERSONAL_MS, { hidden: true, resumed: true }), false)
})

test('a late cached copy of the shared half never replaces a fresher one', () => {
  const fresh = shared({ at: NOW }), stale = shared({ at: NOW - 40_000 })
  assert.equal(newerShared(fresh, stale), fresh)
  assert.equal(newerShared(stale, fresh), fresh)
  assert.equal(newerShared(null, stale), stale)
  assert.equal(newerShared(fresh, shared({ at: NOW })).at, NOW)
})
