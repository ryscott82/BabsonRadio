import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_XFADE, MAX_QUEUE, cleanXfade, enqueue, fadeGains, leadSeconds, moveToFront, nextXfade, queueSeconds, removeAt, tapAction } from './boothQueue.ts'

test('crossfade length cycles through the steps and starts over', () => {
  assert.equal(nextXfade(0), 2)
  assert.equal(nextXfade(4), 6)
  assert.equal(nextXfade(12), 0)
  assert.equal(nextXfade(5), DEFAULT_XFADE)
  assert.equal(cleanXfade('8'), 8)
  assert.equal(cleanXfade('99'), DEFAULT_XFADE)
  assert.equal(cleanXfade(null), DEFAULT_XFADE)
})

test('the next song starts early by the crossfade, less on short songs, never when off or unknown', () => {
  assert.equal(leadSeconds(200, 4), 4)
  assert.equal(leadSeconds(9, 12), 3)
  assert.equal(leadSeconds(200, 0), 0)
  assert.equal(leadSeconds(0, 4), 0)
  assert.equal(leadSeconds(NaN, 4), 0)
})

test('equal-power fade keeps the loudness level and ends at full / silent', () => {
  assert.deepEqual(fadeGains(0), { out: 1, in: 0 })
  const end = fadeGains(1)
  assert.ok(end.out < 1e-9 && Math.abs(end.in - 1) < 1e-9)
  for (const k of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const g = fadeGains(k)
    assert.ok(Math.abs(g.out ** 2 + g.in ** 2 - 1) < 1e-9)
  }
  assert.deepEqual(fadeGains(-5), fadeGains(0))
  assert.deepEqual(fadeGains(9), fadeGains(1))
})

test('tapping a song plays it when idle or over a bed, queues it behind a song, double tap plays now, beds always play now', () => {
  const song = { id: 'a', bed: false }, other = { id: 'b', bed: false }, bed = { id: 'c', bed: true }
  assert.equal(tapAction(null, song), 'play')
  assert.equal(tapAction(bed, song), 'play')
  assert.equal(tapAction(song, other), 'queue')
  assert.equal(tapAction(song, other, true), 'play')
  assert.equal(tapAction(song, bed), 'play')
})

test('queue add, remove, move to front, cap and length', () => {
  let q = enqueue<number>([], 1)
  q = enqueue(q, 2); q = enqueue(q, 3)
  assert.deepEqual(q, [1, 2, 3])
  assert.deepEqual(removeAt(q, 1), [1, 3])
  assert.deepEqual(moveToFront(q, 2), [3, 1, 2])
  assert.deepEqual(moveToFront(q, 0), [1, 2, 3])
  assert.deepEqual(moveToFront(q, 9), [1, 2, 3])
  assert.equal(enqueue(Array.from({ length: MAX_QUEUE }, (_, i) => i), 99).length, MAX_QUEUE)
  assert.equal(queueSeconds([{ length: 100 }, { length: 20.5 }, { length: NaN }]), 120.5)
})
