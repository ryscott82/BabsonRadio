import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUsage, resetUsageStore, saveUsage, USAGE_CACHE } from './usageStore.ts'
import { usageWarning, type UsageStatus } from './usageBanner.ts'

const status = (pct: number, over = false): UsageStatus => ({
  month: '2026-11', allowanceHours: 100, hours: pct, pct, source: 'meter', entryDate: null, projectedMonthEnd: over ? 130 : pct, projectedOver: over, daysUntilExhausted: null,
  tiers: { 1: { level: 'normal', locked: false }, 2: { level: 'normal', locked: false }, 3: { level: 'normal', locked: false } } as UsageStatus['tiers'], overall: 'normal',
})
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m } }

test('two readers at the same moment share one call', async () => {
  resetUsageStore()
  let calls = 0
  const fetcher = async () => { calls++; return status(80) }
  const [a, b] = await Promise.all([loadUsage(fetcher, mem()), loadUsage(fetcher, mem())])
  assert.equal(calls, 1)
  assert.equal(a?.pct, 80); assert.equal(b?.pct, 80)
})

test('a later reader within five minutes uses the kept answer, and after that asks again', async () => {
  resetUsageStore()
  let calls = 0
  const fetcher = async () => { calls++; return status(60) }
  const s = mem()
  await loadUsage(fetcher, s, 1000)
  await loadUsage(fetcher, s, 1000 + 4 * 60_000)
  assert.equal(calls, 1)
  await loadUsage(fetcher, s, 1000 + 6 * 60_000)
  assert.equal(calls, 2)
})

test('a failed read says nothing (null) and does not stick', async () => {
  resetUsageStore()
  assert.equal(await loadUsage(async () => { throw new Error('x') }, mem()), null)
  assert.equal((await loadUsage(async () => status(55), mem()))?.pct, 55)
})

test('fresher numbers from the Server load page replace the kept answer', async () => {
  resetUsageStore()
  const s = mem()
  saveUsage(status(40), s, 5)
  assert.ok(s.m.has(USAGE_CACHE))
  assert.equal((await loadUsage(async () => { throw new Error('should not be called') }, s, 10))?.pct, 40)
})

test('the Needs you line uses the banner rules: none under 50%, a line at a step or when the forecast passes', () => {
  assert.equal(usageWarning(null), null)
  assert.equal(usageWarning(status(30)), null)
  assert.equal(usageWarning(status(76)), 'Usage warning: server time is at 76% of the allowance')
  assert.equal(usageWarning(status(30, true)), 'Usage warning: server time is on track to pass the allowance')
})
