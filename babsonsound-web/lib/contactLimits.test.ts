import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY_MS, FLAG_MATCHED, MIN_GAP_MS, NEW_HASH_CAP, anomaly, chargeSync, gapOk, parseSeen, serializeSeen } from './contactLimits.ts'

const NOW = Date.UTC(2026, 10, 1, 12)
const id = (n: number) => n.toString(16).padStart(16, '0')
const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => id(from + i))

test('the seen list round-trips', () => {
  const m = new Map([[id(1), 20000], [id(2), 20001]])
  assert.deepEqual([...parseSeen(serializeSeen(m))], [...m])
  assert.equal(parseSeen(undefined).size, 0)
  assert.equal(parseSeen('short').size, 0)
})

test('re-syncing the same contacts costs nothing against the cap', () => {
  let r = chargeSync(new Map(), ids(0, 3000), NOW)
  assert.equal(r.added, 3000)
  r = chargeSync(r.seen, ids(0, 3000), NOW + DAY_MS)
  assert.equal(r.added, 0)
  assert.equal(r.accepted.size, 3000)
  assert.equal(r.capped, false)
})

test('a sweep of arbitrary numbers hits the cap and the rest is ignored', () => {
  const r = chargeSync(new Map(), ids(0, 6000), NOW)
  assert.equal(r.seen.size, NEW_HASH_CAP)
  assert.equal(r.accepted.size, NEW_HASH_CAP)
  assert.equal(r.capped, true)
  // the next day nothing more gets in, and numbers already counted still work
  const next = chargeSync(r.seen, [...ids(0, 10), ...ids(9000, 50)], NOW + DAY_MS)
  assert.equal(next.accepted.size, 10)
  assert.equal(next.added, 0)
})

test('numbers drop out of the count after 30 days', () => {
  const first = chargeSync(new Map(), ids(0, 5000), NOW)
  const later = chargeSync(first.seen, ids(7000, 100), NOW + 31 * DAY_MS)
  assert.equal(later.added, 100)
  assert.equal(later.capped, false)
  assert.equal(later.seen.size, 100)
})

test('one sync a day', () => {
  assert.equal(gapOk(NOW, NOW + 60_000), false)
  assert.equal(gapOk(NOW, NOW + MIN_GAP_MS - 1), false)
  assert.equal(gapOk(NOW, NOW + MIN_GAP_MS), true)
  assert.equal(gapOk(0, NOW), true)
})

test('scrape-looking syncs are flagged, normal ones are not', () => {
  assert.equal(anomaly({ sent: 1500, matched: 120 }), null)
  assert.equal(anomaly({ sent: 3000, matched: FLAG_MATCHED - 1 }), null)
  assert.ok(anomaly({ sent: 3000, matched: FLAG_MATCHED }))
  assert.ok(anomaly({ sent: 400, matched: 300 }))     // 75% of a big list
  assert.equal(anomaly({ sent: 100, matched: 80 }), null) // small list, high ratio is normal
})
