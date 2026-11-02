import test from 'node:test'
import assert from 'node:assert/strict'
import { createMeter, readsOf, wrapReads } from './readMeterCore.ts'

const mk = (route = { name: '/api/a', key: {} as object | null }) => {
  let t = Date.UTC(2026, 9, 30, 12, 0, 5)
  const lines: string[] = []
  const meter = createMeter({ now: () => t, route: () => route, log: l => lines.push(l), instance: 'x' })
  return { meter, lines, tick: (ms: number) => { t += ms }, route }
}

test('billing rules: documents returned, 1 for an empty query, 1 for a single doc', () => {
  assert.equal(readsOf([{}, {}, {}]), 3) // getAll of 3
  assert.equal(readsOf({ size: 5, docs: [1, 2, 3, 4, 5] }), 5)
  assert.equal(readsOf({ size: 0, docs: [] }), 1) // empty query is still 1 read
  assert.equal(readsOf({ exists: false }), 1) // a missing document is still 1 read
  assert.equal(readsOf({ data: () => ({ count: 9 }) }), 1) // aggregate
})

test('counts reads per route per minute and the biggest single request', () => {
  const { meter, route } = mk()
  const req1 = {}, req2 = {}
  route.key = req1; meter.request(); meter.add(3); meter.add(2)
  route.key = req2; meter.request(); meter.add(10)
  route.name = '/api/b'; route.key = {}; meter.request(); meter.add(1)
  const [row] = meter.snapshot()
  assert.equal(row.total, 16)
  assert.deepEqual(row.routes['/api/a'], { reads: 15, requests: 2, maxPerRequest: 10 })
  assert.deepEqual(row.routes['/api/b'], { reads: 1, requests: 1, maxPerRequest: 1 })
  assert.deepEqual(Object.keys(row.routes), ['/api/a', '/api/b']) // biggest first
})

test('one log line per finished minute, and old minutes are dropped', () => {
  const { meter, lines, tick } = mk()
  meter.request(); meter.add(4)
  assert.equal(lines.length, 0)
  tick(61_000); meter.add(1)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^\[firestore-reads\] \{"m":"2026-10-30T12:00","i":"x","total":4,"routes":\{"\/api\/a":\[4,1,4\]\}\}$/)
  tick(3 * 3_600_000); meter.add(1)
  assert.ok(meter.snapshot().length <= 2)
})

test('wrapReads counts the awaited result and passes it through untouched', async () => {
  const { meter } = mk()
  class Q { async get() { return { size: 7, docs: new Array(7).fill(0) } } }
  assert.equal(wrapReads(Q.prototype as unknown as Record<string, unknown>, 'get', meter), true)
  assert.equal(wrapReads(Q.prototype as unknown as Record<string, unknown>, 'get', meter), false) // never wrapped twice
  const r = await new Q().get()
  assert.equal(r.size, 7)
  assert.equal(meter.snapshot()[0].total, 7)
})

test('a failing read is not counted and a counting error never breaks the read', async () => {
  const { meter } = mk()
  class Q { async get(): Promise<unknown> { throw new Error('boom') } async all() { return [1, 2] } }
  wrapReads(Q.prototype as unknown as Record<string, unknown>, 'get', meter)
  await assert.rejects(() => new Q().get(), /boom/)
  assert.equal(meter.snapshot().length, 0)
  wrapReads(Q.prototype as unknown as Record<string, unknown>, 'all', meter, () => { throw new Error('bad count') })
  assert.deepEqual(await new Q().all(), [1, 2])
})
