import test from 'node:test'
import assert from 'node:assert/strict'
import { canReset, changedOnly, confirmText, formatValue, fromInput, isChanged, needsConfirm, resetValue, settingMatches, toInput, validate, type SettingDef } from './settingRow.ts'
import { SETTINGS, byId } from './settingsDefs.ts'
import { DEFAULT_AUDIENCE, DEFAULT_LIMITS } from './listenLimits.ts'
import { DEFAULT_CONFIG } from './autoschedule.ts'
import { DEFAULT_THRESHOLDS } from './cpuTiers.ts'

const num: SettingDef = { id: 't.n', tier: 'customize', level: 2, label: 'Idle', help: 'h', kind: 'number', default: 60, min: 0, max: 1440, unit: 'minutes', group: 'g' }
const pct: SettingDef = { id: 't.p', tier: 'defaults', level: 3, label: 'Slow at', help: 'h', kind: 'number', default: 0.5, scale: 100, min: 0.01, max: 10, unit: '%', group: 'g', affects: 'every listener', risk: 'The site can be paused.' }
const flag: SettingDef = { id: 't.b', tier: 'everyday', level: 2, label: 'Learn', help: 'h', kind: 'boolean', default: true, group: 'g' }

test('changed means the stored value differs from the default; an unloaded value is never changed', () => {
  assert.equal(isChanged(num, 60), false)
  assert.equal(isChanged(num, 30), true)
  assert.equal(isChanged(num, undefined), false)
  assert.equal(isChanged(flag, false), true)
})

test('reset goes back to the default, and is offered only when there is something to reset', () => {
  assert.equal(resetValue(num), 60)
  assert.equal(resetValue(pct), 0.5)
  assert.equal(canReset(num, 60), false)
  assert.equal(canReset(num, 5), true)
  assert.equal(isChanged(num, resetValue(num)), false) // after a reset the badge goes away
})

test('only Level 3 values ask for a confirm step', () => {
  assert.equal(needsConfirm(num), false)
  assert.equal(needsConfirm(pct), true)
})

test('the confirm text says who is affected, the new value, the default, and calls a reset a reset', () => {
  const c = confirmText(pct, 0.9, 0.5)
  assert.match(c.body, /every listener/)
  assert.match(c.body, /from 50% to 90%/)
  assert.match(c.body, /default: 50%/)
  assert.match(c.body, /paused/)
  assert.equal(c.action, 'Change it')
  const r = confirmText(pct, resetValue(pct), 0.9)
  assert.equal(r.action, 'Reset')
  assert.match(r.title, /Reset/)
})

test('numbers show with their unit, percents are scaled, hours read like a clock', () => {
  assert.equal(formatValue(num, 60), '60 minutes')
  assert.equal(formatValue(pct, 0.75), '75%')
  assert.equal(formatValue(flag, true), 'On')
  assert.equal(formatValue({ ...num, kind: 'hour' }, 0), '12 AM')
  assert.equal(formatValue({ ...num, kind: 'hour' }, 13), '1 PM')
  assert.equal(formatValue(num, undefined), '…')
})

test('the box shows a percent and converts back to the stored fraction', () => {
  assert.equal(toInput(pct, 0.75), '75')
  assert.equal(fromInput(pct, '75'), 0.75)
  assert.equal(fromInput(pct, '12.5'), 0.125)
  assert.equal(fromInput(num, ''), null)
  assert.equal(fromInput(num, 'abc'), null)
})

test('validation keeps numbers inside the range and whole where they must be', () => {
  assert.equal(validate(num, 60), null)
  assert.match(validate(num, -1) ?? '', /at least/)
  assert.match(validate(num, 2000) ?? '', /at most/)
  assert.match(validate(num, 1.5) ?? '', /whole number/)
  assert.match(validate(num, null) ?? '', /Enter a number/)
  assert.equal(validate(pct, 0.5), null)
})

test('the Changed from default filter keeps only changed rows', () => {
  const rows = [{ def: num, value: 60 }, { def: flag, value: false }, { def: pct, value: undefined }]
  assert.deepEqual(changedOnly(rows).map(r => r.def.id), ['t.b'])
})

test('search matches label, help, group and keywords, all words in any order', () => {
  assert.equal(settingMatches(num, 'idle'), true)
  assert.equal(settingMatches({ ...num, keywords: 'inactive' }, 'inactive idle'), true)
  assert.equal(settingMatches(num, 'zebra'), false)
  assert.equal(settingMatches(num, '  '), true)
})

// ── The real settings list ──
test('every setting has a unique id, a tier, help text, and a valid default', () => {
  const ids = new Set<string>()
  for (const s of SETTINGS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id)
    assert.ok(['everyday', 'customize', 'defaults'].includes(s.tier), s.id)
    assert.ok(s.label.length > 3 && s.help.length > 10, s.id)
    assert.equal(validate(s, s.default), null, `${s.id} default fails its own range`)
    if (s.level === 3) assert.ok(s.affects, `${s.id} is Level 3 but says nobody is affected`)
  }
  for (const t of ['everyday', 'customize', 'defaults'] as const) assert.ok(SETTINGS.some(s => s.tier === t), t)
})

test('defaults match the constants the server uses', () => {
  assert.equal(byId('limits.student.idleMin')?.default, DEFAULT_AUDIENCE.idleMin)
  assert.equal(byId('limits.guest.quietStart')?.default, DEFAULT_AUDIENCE.quietStart)
  assert.equal(byId('limits.refreshSec')?.default, DEFAULT_LIMITS.refreshSec)
  assert.equal(byId('auto.horizonHours')?.default, DEFAULT_CONFIG.horizonHours)
  assert.equal(byId('auto.stepMinutes')?.default, String(DEFAULT_CONFIG.stepMinutes))
  for (const t of [1, 2, 3] as const) for (const k of ['tight', 'critical'] as const) assert.equal(byId(`cpu.th.${t}.${k}`)?.default, DEFAULT_THRESHOLDS[t][k])
})

test('values that can hurt every listener are Level 3 and ask first', () => {
  for (const id of ['limits.refreshSec', 'auto.syncToAzuraCast', 'cpu.budgetHours', 'cpu.auto', 'cpu.th.2.critical']) assert.equal(needsConfirm(byId(id)!), true, id)
  assert.equal(needsConfirm(byId('auto.learn')!), false)
})
