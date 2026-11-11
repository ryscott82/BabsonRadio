import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyForm, formFromEntry, parseCount, parseForm, parseGB, parseHours, type UsageForm } from './usageForm.ts'

const TODAY = '2026-11-09'
const good: UsageForm = { date: '2026-11-08', cpu: '1.5', edge: '1,204,330', invocations: '40000', gb: '3.2', routes: [], note: ' weekly ' }

test('hours read the way Vercel shows them', () => {
  assert.equal(parseHours('1.5'), 1.5)
  assert.equal(parseHours('1.5h'), 1.5)
  assert.equal(parseHours('1h 30m'), 1.5)
  assert.equal(parseHours('2h 15m 36s'), 2.26)
  assert.equal(parseHours('90m'), 1.5)
  assert.equal(parseHours('0'), 0)
  for (const bad of ['', 'abc', '-1', '1..5', 'h', '1.5 hours']) assert.equal(parseHours(bad), null, bad)
})

test('counts accept commas and K, M, B; sizes accept MB and TB', () => {
  assert.equal(parseCount('1,204,330'), 1204330)
  assert.equal(parseCount('1.2M'), 1200000)
  assert.equal(parseCount('850k'), 850000)
  assert.equal(parseCount('2B'), 2e9)
  for (const bad of ['', '-5', '1.2.3', 'lots', '5X']) assert.equal(parseCount(bad), null, bad)
  assert.equal(parseGB('3.2'), 3.2)
  assert.equal(parseGB('800 MB'), 0.8)
  assert.equal(parseGB('1.1 TB'), 1100)
  assert.equal(parseGB('x'), null)
})

test('a good form gives an entry the server accepts (trimmed note, no routes key when none)', () => {
  const r = parseForm(good, TODAY)
  assert.ok(r.ok && r.entry)
  assert.deepEqual(r.errors, {})
  assert.equal(r.entry!.edgeRequests, 1204330)
  assert.equal(r.entry!.note, 'weekly')
  assert.equal('topRoutes' in r.entry!, false)
})

test('every empty or bad field gets its own plain message, and nothing is saved', () => {
  const r = parseForm({ ...emptyForm('2026-02-30') }, TODAY)
  assert.equal(r.ok, false)
  assert.deepEqual(Object.keys(r.errors).sort(), ['cpu', 'date', 'edge', 'gb', 'invocations'])
  const bad = parseForm({ ...good, cpu: 'lots', edge: '-3', invocations: '1.2.3', gb: 'big' }, TODAY)
  assert.deepEqual(Object.keys(bad.errors).sort(), ['cpu', 'edge', 'gb', 'invocations'])
  assert.equal(parseForm({ ...good, cpu: '200000' }, TODAY).ok, false)
  assert.equal(parseForm({ ...good, note: 'x'.repeat(501) }, TODAY).errors.note !== undefined, true)
})

test('a date in the future is refused, today and yesterday are fine', () => {
  assert.ok(parseForm({ ...good, date: '2026-11-10' }, TODAY).ok) // a day of slack for time zones
  assert.match(parseForm({ ...good, date: '2026-11-12' }, TODAY).errors.date ?? '', /not happened/)
})

test('route rows: empty rows are ignored, half-filled rows and repeats are explained', () => {
  const ok = parseForm({ ...good, routes: [{ route: ' /api/listen ', hours: '0.4' }, { route: '', hours: '' }, { route: '/api/skip', hours: '12m' }] }, TODAY)
  assert.ok(ok.ok)
  assert.deepEqual(ok.entry!.topRoutes, [{ route: '/api/listen', cpuHours: 0.4 }, { route: '/api/skip', cpuHours: 0.2 }])
  assert.match(parseForm({ ...good, routes: [{ route: '', hours: '1' }] }, TODAY).errors.routes ?? '', /Row 1/)
  assert.match(parseForm({ ...good, routes: [{ route: '/a', hours: '' }] }, TODAY).errors.routes ?? '', /Row 1/)
  assert.match(parseForm({ ...good, routes: [{ route: '/a', hours: '1' }, { route: '/a', hours: '2' }] }, TODAY).errors.routes ?? '', /twice/)
  assert.match(parseForm({ ...good, routes: Array.from({ length: 21 }, (_, i) => ({ route: `/r${i}`, hours: '0.01' })) }, TODAY).errors.routes ?? '', /20/)
})

test('warnings, not errors: a reading lower than an earlier one, higher than a later one, or routes above the total', () => {
  const others = [{ date: '2026-11-05', activeCpuHours: 2 }, { date: '2026-11-20', activeCpuHours: 1.6 }, { date: '2026-10-20', activeCpuHours: 9 }]
  const r = parseForm(good, TODAY, others)
  assert.ok(r.ok)
  assert.equal(r.warnings.length, 1) // 1.5 is lower than the 2 on the 5th; the 20th is in the future of this one but higher, and the October one is another month
  assert.match(r.warnings[0], /2026-11-05/)
  const hi = parseForm({ ...good, cpu: '1.8', date: '2026-11-08' }, TODAY, [{ date: '2026-11-09', activeCpuHours: 1.7 }])
  assert.match(hi.warnings[0], /later reading/)
  const routes = parseForm({ ...good, routes: [{ route: '/a', hours: '2' }] }, TODAY)
  assert.ok(routes.ok)
  assert.match(routes.warnings[0], /add up to more/)
})

test('an entry goes back into the form as the text an admin would type', () => {
  const f = formFromEntry({ date: '2026-11-08', activeCpuHours: 1.5, edgeRequests: 1204330, functionInvocations: 40000, fastDataTransferGB: 3.2, note: 'n', topRoutes: [{ route: '/api/listen', cpuHours: 0.4 }] })
  assert.deepEqual(f, { date: '2026-11-08', cpu: '1.5', edge: '1204330', invocations: '40000', gb: '3.2', routes: [{ route: '/api/listen', hours: '0.4' }], note: 'n' })
  const back = parseForm(f, TODAY)
  assert.ok(back.ok)
})
