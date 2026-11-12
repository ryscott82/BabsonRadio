import test from 'node:test'
import assert from 'node:assert/strict'
import { SETTING_UI, toRow, type ServerSetting } from './settingsDefs.ts'
import { SETTINGS, BY_KEY } from './adminSettings.ts'
import { changedRows, guestsDiffer, guestsFollowStudents, listeningChanges, resetAllBody, resetAllText, splitRows, statusLine, type Row } from './settingsGroups.ts'
import { PRESETS, presetValues, protectionOf } from './protectionPresets.ts'
import { patchBody } from './settingRow.ts'

const rowOf = (key: string, value?: ServerSetting['value'], visible: 'main' | 'expert' = 'main'): Row => {
  const d = BY_KEY.get(key)!
  return toRow({ key, label: d.label, level: d.level, kind: d.kind, min: d.min, max: d.max, options: d.options, default: d.default, value: value ?? d.default, changed: false, changedAt: null, changedBy: null, visible, enforced: true })
}

test('the status line says everything is recommended, or how many changed', () => {
  assert.equal(statusLine(0), 'Everything is on the recommended settings.')
  assert.equal(statusLine(3), '3 changed from recommended')
})

test('Reset all sends null for the changed keys only, in one PATCH', () => {
  const rows = [rowOf('slots.afterHours', 48), rowOf('slots.weekLimit'), rowOf('slots.minLeadHours', 30, 'expert'), rowOf('slots.maxRepeatWeeks')]
  assert.equal(changedRows(rows).length, 2)
  assert.deepEqual(resetAllBody(rows), { changes: { 'slots.afterHours': null, 'slots.minLeadHours': null } })
  assert.deepEqual(resetAllBody([rowOf('slots.weekLimit')]), { changes: {} })
})

test('the Reset all confirm names how many, who is affected, and which settings', () => {
  const t = resetAllText([rowOf('slots.afterHours', 48), rowOf('slots.weekLimit', 3)])
  assert.match(t.title, /Reset 2 settings/)
  assert.match(t.body, /every student.s show request approves/)
  assert.match(t.body, /How long should a show request wait/)
})

test('main settings become cards and everything else goes to the closed Expert fold', () => {
  const { main, expert } = splitRows([rowOf('slots.afterHours'), rowOf('slots.minLeadHours', undefined, 'expert')])
  assert.deepEqual(main.map(r => r.def.id), ['slots.afterHours'])
  assert.deepEqual(expert.map(r => r.def.id), ['slots.minLeadHours'])
})

test('the guest switch: OFF writes the student value to both the student and guest key', () => {
  assert.deepEqual(listeningChanges('limits.student.idleMin', 30, false), { 'limits.student.idleMin': 30, 'limits.guest.idleMin': 30 })
  assert.deepEqual(listeningChanges('limits.student.quietEnabled', false, false), { 'limits.student.quietEnabled': false, 'limits.guest.quietEnabled': false })
})

test('the guest switch: Reset (null) also goes to both keys when it is off', () => {
  assert.deepEqual(listeningChanges('limits.student.sessionMaxMin', null, false), { 'limits.student.sessionMaxMin': null, 'limits.guest.sessionMaxMin': null })
})

test('the guest switch: ON writes only the key that was edited', () => {
  assert.deepEqual(listeningChanges('limits.student.idleMin', 30, true), { 'limits.student.idleMin': 30 })
  assert.deepEqual(listeningChanges('limits.guest.idleMin', 45, true), { 'limits.guest.idleMin': 45 })
  assert.deepEqual(listeningChanges('limits.guest.idleMin', 45, false), { 'limits.guest.idleMin': 45 })
})

test('a setting that is not a shared listening value is never mirrored', () => {
  assert.deepEqual(listeningChanges('limits.student.dailyCapMin', 10, false), { 'limits.student.dailyCapMin': 10 })
  assert.deepEqual(listeningChanges('limits.refreshSec', 30, false), { 'limits.refreshSec': 30 })
})

test('the switch starts ON when students and guests already differ, so nothing is hidden', () => {
  const vals: Record<string, number> = { 'limits.student.idleMin': 30, 'limits.guest.idleMin': 30, 'limits.student.sessionMaxMin': 120, 'limits.guest.sessionMaxMin': 120 }
  assert.equal(guestsDiffer(k => vals[k]), false)
  assert.equal(guestsDiffer(k => (k === 'limits.guest.idleMin' ? 10 : vals[k])), true)
  assert.deepEqual(guestsFollowStudents(k => (k === 'limits.guest.idleMin' ? 10 : vals[k])), { 'limits.guest.idleMin': 30 })
})

test('the real list: the five show-request and listening values that matter are main, and the main list is short', () => {
  const asRow = (d: (typeof SETTINGS)[number]) => rowOf(d.key)
  assert.ok(asRow(BY_KEY.get('cpu.protection')!))
  assert.ok(SETTINGS.length > 30)
  for (const k of Object.keys(SETTING_UI)) assert.ok(BY_KEY.has(k), k)
})

test('protection levels: a preset is one PATCH, Custom is read-only', () => {
  assert.deepEqual(patchBody('cpu.protection', 'strict'), { changes: { 'cpu.protection': 'strict' } })
  assert.deepEqual(patchBody('cpu.protection', null), { changes: { 'cpu.protection': null } })
  const row = rowOf('cpu.protection', 'custom')
  assert.ok(row.def.choices?.some(c => c.value === 'custom'))
  assert.deepEqual(PRESETS, ['relaxed', 'normal', 'strict'])
})

test('protection presets map to and from the stored thresholds, Strict earlier than Normal earlier than Relaxed', () => {
  for (const p of PRESETS) assert.equal(protectionOf(k => presetValues(p)[k]), p)
  assert.equal(protectionOf(k => presetValues('normal')[k] + (k === 'cpu.reactionShare' ? 0.01 : 0)), 'custom')
  assert.ok(presetValues('strict')['cpu.th.3.tight'] < presetValues('normal')['cpu.th.3.tight'])
  assert.ok(presetValues('relaxed')['cpu.th.3.tight'] > presetValues('normal')['cpu.th.3.tight'])
})

test('dead values are labelled Not enforced right now and sit in Expert only', () => {
  const d = BY_KEY.get('limits.student.dailyCapMin')!
  const r = toRow({ key: d.key, label: d.label, level: d.level, kind: d.kind, min: d.min, max: d.max, options: d.options, default: d.default, value: d.default, changed: false, changedAt: null, changedBy: null, visible: 'expert', enforced: false })
  assert.equal(r.def.notEnforced, true); assert.equal(r.def.visible, 'expert')
})
