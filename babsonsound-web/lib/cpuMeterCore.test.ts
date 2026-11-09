import test from 'node:test'
import assert from 'node:assert/strict'
import { createCpuMeter, totalsOf } from './cpuMeterCore.ts'

const T0 = Date.UTC(2026, 10, 8, 15, 0, 5)

function setup() {
  let t = T0, cpu = 0
  const lines: string[] = []
  const m = createCpuMeter({ now: () => t, cpu: () => cpu, log: l => lines.push(l), instance: 'test', keepMinutes: 60 })
  return { m, lines, advance: (ms: number, cpuMs = 0) => { t += ms; cpu += cpuMs }, get now() { return t } }
}

test('one request: its CPU and wall time land on its route', () => {
  const s = setup()
  const end = s.m.start('/api/listen')
  s.advance(40, 12)
  end()
  const [min] = s.m.snapshot()
  assert.deepEqual(min.routes['/api/listen'], { requests: 1, cpuMs: 12, wallMs: 40, maxCpuMs: 12 })
  assert.equal(min.totalCpuMs, 12)
  assert.equal(min.idleCpuMs, 0)
})

test('CPU used while a request runs is shared among the requests running then; the total stays exact', () => {
  const s = setup()
  const a = s.m.start('/api/a')
  s.advance(10, 4)           // only A running: 4 ms to A
  const b = s.m.start('/api/b')
  s.advance(10, 6)           // A and B running: 3 ms each
  a()
  s.advance(10, 2)           // only B left: 2 ms to B
  b()
  const [min] = s.m.snapshot()
  assert.equal(min.routes['/api/a'].cpuMs, 7)
  assert.equal(min.routes['/api/b'].cpuMs, 5)
  assert.equal(min.totalCpuMs, 12)
})

test('CPU used while nothing is running is kept apart as idle, not charged to a route', () => {
  const s = setup()
  s.advance(1000, 8)
  const end = s.m.start('/api/x')
  s.advance(5, 1)
  end()
  const [min] = s.m.snapshot()
  assert.equal(min.idleCpuMs, 8)
  assert.equal(min.routes['/api/x'].cpuMs, 1)
  assert.equal(min.totalCpuMs, 9)
})

test('ending twice counts once; track() ends even when the work throws', async () => {
  const s = setup()
  const end = s.m.start('/api/y')
  end(); end()
  assert.equal(s.m.snapshot()[0].routes['/api/y'].requests, 1)
  await assert.rejects(s.m.track(() => '/api/z', async () => { s.advance(3, 1); throw new Error('boom') }), /boom/)
  assert.equal(s.m.snapshot()[0].routes['/api/z'].requests, 1)
})

test('writes one log line per finished minute, with calls, CPU, wall time and the worst call per route', () => {
  const s = setup()
  const end = s.m.start('/api/listen')
  s.advance(20, 5)
  end()
  assert.equal(s.lines.length, 0) // the minute is not over yet
  s.advance(60_000, 0)
  const e2 = s.m.start('/api/listen') // a new minute starts: the old one is written
  e2()
  assert.equal(s.lines.length, 1)
  assert.match(s.lines[0], /^\[cpu-meter\] /)
  const j = JSON.parse(s.lines[0].replace('[cpu-meter] ', ''))
  assert.equal(j.i, 'test')
  assert.deepEqual(j.routes['/api/listen'], [1, 5, 20, 5])
})

test('totals add the minutes up per route, sorted by CPU, with the average and the reads', () => {
  const s = setup()
  for (let i = 0; i < 3; i++) { const e = s.m.start('/api/listen'); s.advance(10, 6); e() }
  const e = s.m.start('/api/vote'); s.advance(10, 20); e()
  s.advance(61_000)
  const e3 = s.m.start('/api/listen'); s.advance(10, 6); e3()
  const t = totalsOf(s.m.snapshot(), { '/api/listen': { reads: 40 } })
  assert.deepEqual(t.map(r => r.route), ['/api/listen', '/api/vote'])
  assert.equal(t[0].requests, 4)
  assert.equal(t[0].cpuMs, 24)
  assert.equal(t[0].avgCpuMs, 6)
  assert.equal(t[0].reads, 40)
  assert.equal(t[1].maxCpuMs, 20)
})

test('old minutes are dropped after an hour', () => {
  const s = setup()
  const e = s.m.start('/api/old'); s.advance(5, 1); e()
  s.advance(61 * 60_000)
  const e2 = s.m.start('/api/new'); s.advance(5, 1); e2()
  const all = s.m.snapshot()
  assert.ok(all.every(m => !('/api/old' in m.routes)))
})
