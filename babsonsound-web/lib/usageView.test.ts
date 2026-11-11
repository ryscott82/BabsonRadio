import test from 'node:test'
import assert from 'node:assert/strict'
import { enteredSeries, featureRows, meterAt, meterSeries, monthsOf, niceMax, ticks, whatIf } from './usageView.ts'

test('entered readings: one point per day (the last entered wins), only the month asked for, in day order', () => {
  const pts = enteredSeries('2026-11', [
    { date: '2026-11-08', activeCpuHours: 1, enteredAt: 1 }, { date: '2026-11-03', activeCpuHours: 0.4, enteredAt: 1 },
    { date: '2026-11-08', activeCpuHours: 1.2, enteredAt: 5 }, { date: '2026-10-30', activeCpuHours: 3.9, enteredAt: 1 },
  ])
  assert.deepEqual(pts, [{ day: 3, hours: 0.4 }, { day: 8, hours: 1.2 }])
})

test('the meter adds up day by day and starts from the offset', () => {
  const s = meterSeries('2026-11', { '1': 0.1, '2': 0.2, '4': 0.5 }, 1, 5)
  assert.deepEqual(s.map(p => p.hours), [1.1, 1.3, 1.3, 1.8, 1.8])
  assert.equal(meterAt('2026-11-04', { '1': 0.1, '2': 0.2, '4': 0.5 }, 1), 1.8)
  assert.equal(meterAt('2026-11-04', undefined), null)
  assert.equal(meterAt('2026-11-04', {}), null)
  assert.equal(meterSeries('2026-02', {}).length, 28)
})

test('axis tops are round numbers with room above the data', () => {
  assert.equal(niceMax(0), 1)
  assert.equal(niceMax(4.4), 5)
  assert.equal(niceMax(0.0063), 0.008)
  assert.equal(niceMax(120), 150)
  assert.ok([4.4, 9.9, 0.3, 77].every(v => niceMax(v) >= v))
  assert.deepEqual(ticks(5), [0, 1.25, 2.5, 3.75, 5])
})

test('months offered: the current one first, then every month that has a reading', () => {
  assert.deepEqual(monthsOf([{ date: '2026-09-02' }, { date: '2026-10-30' }, { date: '2026-10-02' }], '2026-11'), ['2026-11', '2026-10', '2026-09'])
  assert.deepEqual(monthsOf([], '2026-11'), ['2026-11'])
})

test('feature table: our meter adds the average time per call, matched by route', () => {
  const rows = featureRows([
    { route: '/api/listen', requests: 100, cpuMs: 4000, avgCpuMs: 40 },
    { route: '/api/skip', requests: 50, cpuMs: 500, avgCpuMs: 10 }, { route: '/api/vote', requests: 50, cpuMs: 1500, avgCpuMs: 30 },
    { route: '/api/listenX', requests: 5, cpuMs: 9000, avgCpuMs: 1800 },
  ])
  const listen = rows.find(r => r.id === 'listen')!
  assert.equal(listen.avgMs, 40)
  assert.equal(listen.secondsPerHour, (6 * 40) / 1000)
  const taps = rows.find(r => r.id === 'taps')!
  assert.equal(taps.avgMs, 20) // (500 + 1500) / 100 calls
  assert.equal(rows.find(r => r.id === 'reactions')!.avgMs, null)
  assert.ok(featureRows(null).every(r => r.avgMs === null && r.secondsPerHour === null))
})

test('what if: listeners x hours x measured cost, against the allowance and what is already used', () => {
  const w = whatIf({ listeners: 20, hours: 100, secondsPerListenerHour: 36, allowanceHours: 4, usedHours: 1.5 })!
  assert.equal(w.cpuHours, 20) // 2000 listener-hours x 36 s = 72000 s
  assert.equal(w.pctOfAllowance, 500)
  assert.equal(w.afterThisHours, 21.5)
  assert.equal(w.fits, false)
  const small = whatIf({ listeners: 5, hours: 10, secondsPerListenerHour: 36, allowanceHours: 4, usedHours: 1 })!
  assert.equal(Math.round(small.cpuHours * 1000) / 1000, 0.5)
  assert.equal(small.fits, true)
  assert.equal(whatIf({ listeners: 5, hours: 10, secondsPerListenerHour: 36, allowanceHours: 4 })!.fits, null)
  assert.equal(whatIf({ listeners: NaN, hours: 1, secondsPerListenerHour: 1, allowanceHours: 4 }), null)
  assert.equal(whatIf({ listeners: -1, hours: 1, secondsPerListenerHour: 1, allowanceHours: 4 }), null)
})
