import test from 'node:test'
import assert from 'node:assert/strict'
import { THRESHOLDS, buildForecast, cleanEntry, daysInMonth, etWeekday, project, projectedOver, reminderDue, thresholdsToFire, validDate } from './serverUsage.ts'

const DAY = 86_400_000
const ok = { date: '2026-11-08', activeCpuHours: 1.5, edgeRequests: 120000, functionInvocations: 40000, fastDataTransferGB: 3.2, note: ' weekly check ' }

test('dates must be real days', () => {
  assert.ok(validDate('2026-11-08'))
  for (const bad of ['2026-02-30', '2026-13-01', '26-11-08', '2026-11-8', '', null, 5]) assert.equal(validDate(bad), false, String(bad))
})

test('a good entry is cleaned (note trimmed) and the optional routes list is kept', () => {
  const r = cleanEntry({ ...ok, topRoutes: [{ route: ' /api/listen ', cpuHours: 0.4 }] })
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.entry.note, 'weekly check'); assert.deepEqual(r.entry.topRoutes, [{ route: '/api/listen', cpuHours: 0.4 }]) }
  const none = cleanEntry(ok)
  assert.ok(none.ok && none.entry.topRoutes === undefined)
})

test('a bad entry gets a plain error, never a throw', () => {
  const bad = (o: Record<string, unknown>) => { const r = cleanEntry({ ...ok, ...o }); assert.equal(r.ok, false); return r.ok ? '' : r.error }
  assert.match(bad({ date: 'tomorrow' }), /Date/)
  assert.match(bad({ activeCpuHours: -1 }), /Active CPU/)
  assert.match(bad({ edgeRequests: '5' }), /Edge requests/)
  assert.match(bad({ functionInvocations: NaN }), /invocations/)
  assert.match(bad({ fastDataTransferGB: Infinity }), /Fast data/)
  assert.match(bad({ topRoutes: 'x' }), /Top routes/)
  assert.match(bad({ topRoutes: [{ route: '', cpuHours: 1 }] }), /route name/)
  assert.match(bad({ topRoutes: [{ route: '/a', cpuHours: -1 }] }), /route name/)
  assert.match(bad({ topRoutes: Array.from({ length: 21 }, () => ({ route: '/a', cpuHours: 0 })) }), /20/)
  assert.equal(cleanEntry(null).ok, false)
})

test('projection: rate per day, month end, and days until the allowance runs out', () => {
  assert.equal(daysInMonth('2026-11'), 30)
  const p = project(1.2, 6, '2026-11', 4)
  assert.equal(Math.round(p.perDay * 1000) / 1000, 0.2)
  assert.equal(Math.round(p.projectedMonthEnd * 100) / 100, 6)
  assert.equal(Math.round(p.daysUntilExhausted! * 100) / 100, 14)
  assert.equal(p.pct, 30)
  assert.equal(project(4.5, 10, '2026-11', 4).daysUntilExhausted, 0)
  assert.equal(project(0, 10, '2026-11', 4).daysUntilExhausted, null)
})

test('forecast prefers the entered number, also reports our meter, and works out CPU per listener-hour between the last two entries', () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0)
  const f = buildForecast({
    month: '2026-11', now, allowanceHours: 4, meterHours: 1.0,
    entries: [{ date: '2026-11-08', activeCpuHours: 1.0 }, { date: '2026-11-14', activeCpuHours: 2.6 }, { date: '2026-10-30', activeCpuHours: 3.9 }],
    listenerMinutesByDate: { '2026-11-08': 600, '2026-11-09': 3000, '2026-11-12': 3000, '2026-11-14': 3000, '2026-11-15': 9999 },
  })
  assert.equal(f.fromEntry?.date, '2026-11-14')
  assert.equal(f.fromEntry?.hours, 2.6)
  assert.equal(Math.round(f.fromEntry!.perDay * 1000) / 1000, 0.186)
  assert.equal(f.projectedMonthEnd, f.fromEntry!.projectedMonthEnd)
  assert.equal(Math.round(f.fromMeter.hours * 10) / 10, 1)
  // CPU added: 2.6 - 1.0 = 1.6 h over the listener-hours after the 8th through the 14th: (3000+3000+3000)/60 = 150
  assert.equal(f.costPerListenerHour?.listenerHours, 150)
  assert.equal(Math.round(f.costPerListenerHour!.cpuSeconds * 100) / 100, 38.4)
  assert.equal(f.costPerListenerHour?.fromDate, '2026-11-08')
})

test('forecast with no entry this month falls back to the meter; with one entry the cost is the month so far; with no listeners there is none', () => {
  const now = Date.UTC(2026, 10, 15, 0, 0, 0)
  const a = buildForecast({ month: '2026-11', now, allowanceHours: 4, meterHours: 2, entries: [{ date: '2026-10-30', activeCpuHours: 3 }], listenerMinutesByDate: {} })
  assert.equal(a.fromEntry, null)
  assert.equal(a.projectedMonthEnd, a.fromMeter.projectedMonthEnd)
  assert.equal(a.costPerListenerHour, null)
  const b = buildForecast({ month: '2026-11', now, allowanceHours: 4, meterHours: 2, entries: [{ date: '2026-11-10', activeCpuHours: 1.2 }], listenerMinutesByDate: { '2026-11-03': 1200, '2026-11-10': 1200 } })
  assert.equal(b.costPerListenerHour?.listenerHours, 40)
  assert.equal(b.costPerListenerHour?.fromDate, '2026-11-01')
  assert.equal(buildForecast({ month: '2026-11', now, allowanceHours: 4, meterHours: 2, entries: [{ date: '2026-11-10', activeCpuHours: 1.2 }], listenerMinutesByDate: {} }).costPerListenerHour, null)
})

test('alerts fire once per threshold; a big jump announces only the highest and quietly marks the lower ones', () => {
  assert.deepEqual([...THRESHOLDS], [50, 75, 90, 100])
  assert.deepEqual(thresholdsToFire(40, []), { announce: null, mark: [] })
  assert.deepEqual(thresholdsToFire(50, []), { announce: 50, mark: [50] })
  assert.deepEqual(thresholdsToFire(80, [50]), { announce: 75, mark: [75] })
  assert.deepEqual(thresholdsToFire(95, []), { announce: 90, mark: [50, 75, 90] })
  assert.deepEqual(thresholdsToFire(95, [50, 75, 90]), { announce: null, mark: [] }) // never repeated
  assert.deepEqual(thresholdsToFire(120, [50, 75, 90]), { announce: 100, mark: [100] })
})

test('"on track to run out" waits until day 3 so one busy day is not a trend', () => {
  assert.equal(projectedOver(5, 4, 2), false)
  assert.equal(projectedOver(5, 4, 3), true)
  assert.equal(projectedOver(4, 4, 20), false)
  assert.equal(projectedOver(5, 0, 20), false)
})

test('the weekly reminder goes out Monday morning Eastern, unless an entry or a reminder came in the last 6 days', () => {
  const mon = Date.UTC(2026, 10, 9, 12, 0, 0) // Monday 7:00 am Eastern
  const sun = Date.UTC(2026, 10, 8, 12, 0, 0)
  assert.equal(etWeekday(mon), 'Mon')
  assert.equal(etWeekday(sun), 'Sun')
  assert.equal(etWeekday(Date.UTC(2026, 10, 9, 3, 0, 0)), 'Sun') // 10 pm Sunday in New York is still Sunday
  assert.equal(reminderDue({ now: mon, lastEnteredAt: null, lastSentAt: null }), true)
  assert.equal(reminderDue({ now: sun, lastEnteredAt: null, lastSentAt: null }), false)
  assert.equal(reminderDue({ now: mon, lastEnteredAt: mon - 5 * DAY, lastSentAt: null }), false)
  assert.equal(reminderDue({ now: mon, lastEnteredAt: mon - 6 * DAY, lastSentAt: null }), true)
  assert.equal(reminderDue({ now: mon, lastEnteredAt: mon - 30 * DAY, lastSentAt: mon - 2 * DAY }), false)
  assert.equal(reminderDue({ now: mon, lastEnteredAt: mon - 30 * DAY, lastSentAt: mon - 7 * DAY }), true)
})

test('cost per listener-hour: one point per reading, counted from the reading before it in the same month', async () => {
  const { costIntervals, overallCost } = await import('./serverUsage.ts')
  const mins = { '2026-11-02': 600, '2026-11-03': 600, '2026-11-04': 1200, '2026-11-05': 0, '2026-10-30': 600, '2026-10-31': 600 }
  const pts = costIntervals([
    { date: '2026-11-04', activeCpuHours: 1.0 }, { date: '2026-11-02', activeCpuHours: 0.2 }, { date: '2026-10-31', activeCpuHours: 3.0 },
  ], mins)
  assert.deepEqual(pts.map(p => p.toDate), ['2026-10-31', '2026-11-02', '2026-11-04'])
  assert.equal(pts[0].fromDate, '2026-10-01')
  assert.equal(pts[1].fromDate, '2026-11-01') // the reading before is in another month: this one counts from the 1st
  assert.equal(pts[1].listenerHours, 10) // 600 min on the 2nd only
  assert.equal(Math.round(pts[1].cpuSecondsPerListenerHour * 100) / 100, 72) // 0.2 h = 720 s over 10 listener-hours
  assert.equal(pts[2].fromDate, '2026-11-02')
  assert.equal(pts[2].listenerHours, 30) // 3rd and 4th: 600 + 1200 min
  assert.equal(Math.round(pts[2].cpuSecondsPerListenerHour), 96)
  assert.equal(Math.round(overallCost(pts)!), Math.round(((3.0 + 0.2 + 0.8) * 3600) / (20 + 10 + 30)))
})

test('cost per listener-hour: no point when nobody listened or the reading went down; the last entry of a day wins', async () => {
  const { costIntervals, overallCost } = await import('./serverUsage.ts')
  const mins = { '2026-11-02': 600, '2026-11-03': 0, '2026-11-04': 600 }
  assert.deepEqual(costIntervals([{ date: '2026-11-03', activeCpuHours: 1 }], { '2026-11-03': 0, '2026-11-05': 600 }), [])
  const pts = costIntervals([{ date: '2026-11-02', activeCpuHours: 1, enteredAt: 1 }, { date: '2026-11-02', activeCpuHours: 0.5, enteredAt: 2 }, { date: '2026-11-04', activeCpuHours: 0.4, enteredAt: 3 }], mins)
  assert.equal(pts.length, 1) // the 4th is lower than the 2nd, so no point
  assert.equal(pts[0].cpuHours, 0.5)
  assert.equal(overallCost([]), null)
})
