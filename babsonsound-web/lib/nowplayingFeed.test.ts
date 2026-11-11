import test from 'node:test'
import assert from 'node:assert/strict'
import { feedChanged, feedMark } from './nowplaying.ts'

const raw = (over: Record<string, unknown> = {}) => ({ now_playing: { played_at: 1000, song: { title: 'Secret words are never read from here' } }, live: { is_live: false, streamer_name: '' }, ...over })

test('only the song start time, live status and streamer are read from AzuraCast feed: no titles', () => {
  assert.deepEqual(feedMark(raw()), { playedAt: 1000, isLive: false, streamer: '' })
  assert.deepEqual(feedMark(raw({ live: { is_live: true, streamer_name: 'DJ Sam' } })), { playedAt: 1000, isLive: true, streamer: 'DJ Sam' })
  for (const bad of [null, undefined, 5, 'x', {}, { now_playing: null }]) assert.equal(feedMark(bad), null)
  assert.ok(!('title' in (feedMark(raw()) as object)))
})

test('our route is asked again only when the feed shows a new song, a live change, or a new streamer', () => {
  const np = { playedAt: 1000, isLive: false, streamer: '' }
  assert.equal(feedChanged({ playedAt: 1000, isLive: false, streamer: '' }, np), false)
  assert.equal(feedChanged({ playedAt: 1200, isLive: false, streamer: '' }, np), true)
  assert.equal(feedChanged({ playedAt: 1000, isLive: true, streamer: 'A' }, np), true)
  assert.equal(feedChanged({ playedAt: 1000, isLive: false, streamer: '' }, { ...np, isLive: true, streamer: 'A' }), true)
  assert.equal(feedChanged({ playedAt: 1000, isLive: true, streamer: 'B' }, { ...np, isLive: true, streamer: 'A' }), true)
  assert.equal(feedChanged({ playedAt: 0, isLive: false, streamer: '' }, { ...np, playedAt: 0 }), false) // unknown start times never loop
})
