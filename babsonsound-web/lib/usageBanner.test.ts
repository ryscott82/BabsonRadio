import test from 'node:test'
import assert from 'node:assert/strict'
import { bannerFor, dismissValue, featuresNow, isDismissed, stepOf, statusOf, worstLevel, type UsageStatus } from './usageBanner.ts'

const proj = (hours: number, projectedMonthEnd: number, daysUntilExhausted: number | null) => ({ hours, pct: 0, perDay: 0, projectedMonthEnd, daysUntilExhausted })
const tiers = { 1: { level: 'normal', locked: false }, 2: { level: 'normal', locked: false }, 3: { level: 'normal', locked: false } } as const
const status = (o: Partial<UsageStatus> = {}): UsageStatus => ({
  month: '2026-11', allowanceHours: 4, hours: 0, pct: 0, source: 'meter', entryDate: null, projectedMonthEnd: 0, projectedOver: false, daysUntilExhausted: null,
  tiers: { 1: { level: 'normal', locked: false }, 2: { level: 'normal', locked: false }, 3: { level: 'normal', locked: false } }, overall: 'normal', ...o,
})

test('steps are 50, 75, 90 and 100 percent', () => {
  assert.deepEqual([0, 49.9, 50, 74.9, 75, 89.9, 90, 99.9, 100, 140].map(stepOf), [0, 0, 50, 50, 75, 75, 90, 90, 100, 100])
})

test('no banner below 50% unless the forecast says the month will pass the allowance', () => {
  assert.equal(bannerFor(null), null)
  assert.equal(bannerFor(status({ pct: 20, hours: 0.8 })), null)
  const f = bannerFor(status({ pct: 20, hours: 0.8, projectedOver: true, projectedMonthEnd: 5.2, daysUntilExhausted: 12 }))
  assert.equal(f?.rank, 1)
  assert.match(f!.title, /on track to pass/)
  assert.match(f!.text, /about 5.2 of 4 hours/)
  assert.match(f!.text, /12 days left/)
})

test('each step has its own rank, tone and plain wording; 100% mentions the pause without promising it', () => {
  const b = (pct: number) => bannerFor(status({ pct, hours: (pct / 100) * 4 }))!
  assert.deepEqual([50, 75, 90, 100].map(p => b(p).rank), [2, 3, 4, 5])
  assert.deepEqual([50, 75, 90, 100].map(p => b(p).tone), ['watch', 'warn', 'alert', 'critical'])
  assert.match(b(75).title, /75%/)
  assert.match(b(100).text, /may pause/)
  assert.doesNotMatch(b(100).text, /\bonly\b|will be paused/)
  assert.match(b(90).text, /3.6 of 4 hours/)
})

test('the forecast adds to a step banner without changing its rank', () => {
  const b = bannerFor(status({ pct: 75, hours: 3, projectedOver: true, projectedMonthEnd: 4.9, daysUntilExhausted: 4.2 }))!
  assert.equal(b.rank, 3)
  assert.match(b.text, /about 4.9 of 4 hours/)
  assert.match(b.text, /4 days left/)
})

test('hiding a banner lasts until the next step up or the next month', () => {
  const v = dismissValue('2026-11', 3)
  assert.equal(isDismissed(v, '2026-11', 3), true)
  assert.equal(isDismissed(v, '2026-11', 2), true)
  assert.equal(isDismissed(v, '2026-11', 4), false)
  assert.equal(isDismissed(v, '2026-12', 3), false)
  assert.equal(isDismissed(null, '2026-11', 2), false)
  assert.equal(isDismissed('garbage', '2026-11', 2), false)
})

test('status prefers the larger of the entered reading and our meter, and says which', () => {
  const t = { 1: tiers[1], 2: { level: 'tight', locked: true }, 3: { level: 'critical', locked: false } } as never
  const fc = { month: '2026-11', allowanceHours: 4, fromEntry: { date: '2026-11-08', ...proj(2, 6, 10) }, fromMeter: proj(1.5, 4.5, 20) }
  const s = statusOf({ forecast: fc, tiers: t, dayOfMonth: 9 })
  assert.equal(s.source, 'entry')
  assert.equal(s.hours, 2)
  assert.equal(s.pct, 50)
  assert.equal(s.projectedMonthEnd, 6)
  assert.equal(s.projectedOver, true)
  assert.equal(s.daysUntilExhausted, 10)
  assert.equal(s.overall, 'critical')
  const m = statusOf({ forecast: { ...fc, fromEntry: { date: '2026-11-08', ...proj(1, 3, 30) }, fromMeter: proj(2.4, 7, 5) }, tiers: t, dayOfMonth: 9 })
  assert.equal(m.source, 'meter')
  assert.equal(m.daysUntilExhausted, 5)
  assert.equal(statusOf({ forecast: { ...fc, fromEntry: null }, tiers: t, dayOfMonth: 9 }).entryDate, null)
  // the projection is ignored in the first days of a month
  assert.equal(statusOf({ forecast: fc, tiers: t, dayOfMonth: 2 }).projectedOver, false)
})

test('every feature reads its tier level; the worst level is the overall one', () => {
  const rows = featuresNow({ 1: { level: 'normal', locked: false }, 2: { level: 'tight', locked: false }, 3: { level: 'critical', locked: true } })
  assert.equal(rows.find(r => r.feature === 'reactions')?.level, 'critical')
  assert.equal(rows.find(r => r.feature === 'reactions')?.locked, true)
  assert.equal(rows.find(r => r.feature === 'skip')?.level, 'tight')
  assert.equal(rows.find(r => r.feature === 'signin')?.level, 'normal')
  assert.equal(rows.length, 10)
  assert.equal(worstLevel(['normal', 'tight']), 'tight')
  assert.equal(worstLevel([]), 'normal')
})
