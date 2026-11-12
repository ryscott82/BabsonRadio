import test from 'node:test'
import assert from 'node:assert/strict'
import { canReset, patchBody, valueToSend, changedOnly, confirmText, formatValue, fromInput, isChanged, needsConfirm, resetValue, settingMatches, toInput, validate, type SettingDef } from './settingRow.ts'
import { SETTING_UI, toRow, type ServerSetting } from './settingsDefs.ts'
import { SETTINGS as SERVER_SETTINGS, BY_KEY } from './adminSettings.ts'

const num: SettingDef = { id: 't.n', tier: 'customize', level: 2, label: 'Idle', help: 'h', kind: 'number', integer: true, default: 60, min: 0, max: 1440, unit: 'minutes', group: 'g' }
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

test('Reset sends null, a change sends the value, and the body names the one setting', () => {
  assert.equal(valueToSend(30, true), null)
  assert.equal(valueToSend(30, false), 30)
  assert.deepEqual(patchBody('limits.refreshSec', null), { changes: { 'limits.refreshSec': null } })
  assert.deepEqual(patchBody('auto.learn', false), { changes: { 'auto.learn': false } })
})

// ── The real settings list: the server owns the keys, the page only words them ──
const asServer = (d: (typeof SERVER_SETTINGS)[number], value = d.default): ServerSetting =>
  ({ key: d.key, label: d.label, level: d.level, kind: d.kind, min: d.min, max: d.max, options: d.options, default: d.default, value, changed: false, changedAt: null, changedBy: null })

test('every setting the page words exists on the server, and every server setting becomes a valid row', () => {
  for (const id of Object.keys(SETTING_UI)) assert.ok(BY_KEY.has(id), `${id} is worded on the page but the server does not have it`)
  const ids = new Set<string>()
  for (const d of SERVER_SETTINGS) {
    assert.ok(!ids.has(d.key), `duplicate ${d.key}`); ids.add(d.key)
    const { def } = toRow(asServer(d))
    assert.ok(['everyday', 'customize', 'defaults'].includes(def.tier), d.key)
    assert.ok(def.label.length > 3 && def.help.length > 5, d.key)
    assert.equal(validate(def, def.default), null, `${d.key} default fails its own range`)
    if (def.level === 3) assert.ok(def.affects, `${d.key} is Level 3 but says nobody is affected`)
  }
  for (const t of ['everyday', 'customize', 'defaults'] as const) assert.ok(SERVER_SETTINGS.some(d => toRow(asServer(d)).def.tier === t), t)
})

test('the page words every server setting (no row falls back to a bare server label)', () => {
  for (const d of SERVER_SETTINGS) assert.ok(SETTING_UI[d.key], `${d.key} has no wording in lib/settingsDefs.ts`)
})

test('a row carries who changed it and when', () => {
  const d = SERVER_SETTINGS[0]
  const row = toRow({ ...asServer(d), changed: true, changedAt: 1_700_000_000_000, changedBy: 'a@babson.edu' })
  assert.equal(row.changedBy, 'a@babson.edu')
  assert.equal(row.changedAt, 1_700_000_000_000)
})

test('values that can hurt every listener are Level 3 and ask first', () => {
  for (const id of ['limits.refreshSec', 'auto.syncToAzuraCast', 'cpu.budgetHours', 'cpu.auto', 'cpu.th.2.critical']) {
    const d = BY_KEY.get(id); if (!d) continue
    assert.equal(needsConfirm(toRow(asServer(d)).def), true, id)
  }
})

test('the five show-request settings are Level 3 and the confirm says it changes when every student request approves', () => {
  for (const id of ['slots.afterHours', 'slots.beforeStartHours', 'slots.weekLimit', 'slots.maxRepeatWeeks', 'slots.minLeadHours']) {
    const d = BY_KEY.get(id)!
    assert.ok(d, id)
    const def = toRow(asServer(d)).def
    assert.equal(def.group, 'Show requests')
    assert.equal(needsConfirm(def), true, id)
  }
  const after = toRow(asServer(BY_KEY.get('slots.afterHours')!)).def
  assert.match(confirmText(after, 48, 24).body, /when every student.s show request approves/)
})
