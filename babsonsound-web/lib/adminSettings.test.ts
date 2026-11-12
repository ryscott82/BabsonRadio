import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BY_KEY, SETTINGS, checkValue, clipLog, defaultsOf, planPatch, readValue } from './adminSettings.ts'
import { DEFAULT_AUDIENCE, cleanAudience } from './listenLimits.ts'
import { DEFAULT_THRESHOLDS } from './cpuTiers.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const cur = () => defaultsOf()

test('every setting has a default that passes its own check, and keys are unique', () => {
  assert.equal(new Set(SETTINGS.map(s => s.key)).size, SETTINGS.length)
  for (const s of SETTINGS) assert.equal(checkValue(s, s.default).ok, true, s.key)
})

test('defaults match the ones the existing stores use', () => {
  const d = defaultsOf()
  assert.equal(d['limits.student.idleMin'], DEFAULT_AUDIENCE.idleMin)
  assert.equal(d['limits.guest.quietEnd'], DEFAULT_AUDIENCE.quietEnd)
  assert.equal(d['cpu.th.3.tight'], DEFAULT_THRESHOLDS[3].tight)
  assert.equal(d['cpu.th.1.critical'], DEFAULT_THRESHOLDS[1].critical)
})

test('numbers: at each bound is fine, one past it is refused', () => {
  for (const s of SETTINGS.filter(x => x.kind === 'int' || x.kind === 'num')) {
    assert.equal(checkValue(s, s.min).ok, true, `${s.key} min`)
    assert.equal(checkValue(s, s.max).ok, true, `${s.key} max`)
    assert.equal(checkValue(s, s.min! - (s.kind === 'int' ? 1 : 0.001)).ok, false, `${s.key} below`)
    assert.equal(checkValue(s, s.max! + (s.kind === 'int' ? 1 : 0.001)).ok, false, `${s.key} above`)
  }
})

test('the bounds match the older endpoints', () => {
  assert.equal(checkValue(BY_KEY.get('limits.refreshSec')!, 119).ok, false)
  assert.equal(checkValue(BY_KEY.get('limits.refreshSec')!, 3600).ok, true)
  assert.equal(checkValue(BY_KEY.get('limits.student.quietStart')!, 24).ok, false)
  assert.equal(checkValue(BY_KEY.get('cpu.budgetHours')!, 0.05).ok, false)
  assert.equal(checkValue(BY_KEY.get('cpu.directAt')!, 2).ok, true)
  assert.equal(checkValue(BY_KEY.get('auto.horizonHours')!, 5).ok, false)
})

test('type checks: wrong kind, whole numbers, enums, NaN', () => {
  assert.equal(checkValue(BY_KEY.get('cpu.auto')!, 'yes').ok, false)
  assert.equal(checkValue(BY_KEY.get('limits.refreshSec')!, 600.5).ok, false)
  assert.equal(checkValue(BY_KEY.get('limits.refreshSec')!, '600').ok, false)
  assert.equal(checkValue(BY_KEY.get('limits.refreshSec')!, NaN).ok, false)
  assert.equal(checkValue(BY_KEY.get('cpu.nowPlayingDirect')!, 'always').ok, false)
  assert.equal(checkValue(BY_KEY.get('cpu.nowPlayingDirect')!, 'on').ok, true)
  assert.equal(checkValue(BY_KEY.get('auto.stepMinutes')!, 20).ok, false)
  assert.equal(checkValue(BY_KEY.get('auto.stepMinutes')!, 15).ok, true)
  assert.deepEqual(checkValue(BY_KEY.get('auto.stepMinutes')!, '60'), { ok: true, value: 60 })
  assert.equal(checkValue(BY_KEY.get('auto.stepMinutes')!, '').ok, false)
})

test('a patch lists only real changes, with old and new', () => {
  const r = planPatch(cur(), { 'limits.refreshSec': 600, 'cpu.auto': true })
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.changes, [{ key: 'limits.refreshSec', old: 720, new: 600 }])
})

test('one bad value rejects the whole patch', () => {
  const r = planPatch(cur(), { 'limits.refreshSec': 600, 'cpu.directAt': 5, 'nope.key': 1 })
  assert.equal(r.changes.length, 0)
  assert.equal(r.errors.length, 2)
  assert.match(r.errors.join(' '), /cpu\.directAt/)
  assert.match(r.errors.join(' '), /nope\.key: not a setting/)
})

test('bad shapes and empty patches are refused', () => {
  for (const p of [null, [], 'x', 5, {}]) assert.ok(planPatch(cur(), p).errors.length, JSON.stringify(p))
})

test('null resets to the default, and a value already at the default is not a change', () => {
  const now = { ...cur(), 'limits.refreshSec': 300, 'cpu.nowPlayingDirect': 'on' }
  const r = planPatch(now, { 'limits.refreshSec': null, 'cpu.nowPlayingDirect': null, 'cpu.reactionShare': null })
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.changes, [
    { key: 'limits.refreshSec', old: 300, new: 720 },
    { key: 'cpu.nowPlayingDirect', old: 'on', new: 'auto' },
  ])
})

test('critical is never below tight (same rule as the CPU page), using the saved value for the one not sent; above 1 means never', () => {
  assert.ok(planPatch(cur(), { 'cpu.th.3.tight': 0.8 }).errors.length)
  assert.ok(planPatch(cur(), { 'cpu.th.2.critical': 0.6 }).errors.length)
  assert.deepEqual(planPatch(cur(), { 'cpu.th.3.tight': 0.6, 'cpu.th.3.critical': 0.8 }).errors, [])
  assert.deepEqual(planPatch(cur(), { 'cpu.th.1.critical': 0.5 }).errors, [], 'tier 1 tight is 9 (never), so critical stands alone')
  assert.deepEqual(planPatch(cur(), { 'cpu.th.2.tight': 5 }).errors, [])
})

test('readValue reads the stored path and falls back to the default for anything missing or out of range', () => {
  const d = BY_KEY.get('limits.guest.dailyCapMin')!
  assert.equal(readValue(d, { guest: { dailyCapMin: 90 } }), 90)
  assert.equal(readValue(d, { guest: { dailyCapMin: 99999 } }), d.default)
  assert.equal(readValue(d, undefined), d.default)
  assert.equal(readValue(BY_KEY.get('cpu.th.3.critical')!, { thresholds: { 3: { critical: 0.8 } } }), 0.8)
})

test('a limits patch built from the table is read back by the older audience code unchanged', () => {
  const r = planPatch(cur(), { 'limits.student.dailyCapMin': 120, 'limits.student.quietStart': 1 })
  const input: Record<string, number> = {}
  for (const c of r.changes) input[BY_KEY.get(c.key)!.path[1]] = c.new as number
  const a = cleanAudience(input, DEFAULT_AUDIENCE)
  assert.equal(a.dailyCapMin, 120); assert.equal(a.quietStart, 1); assert.equal(a.idleMin, DEFAULT_AUDIENCE.idleMin)
})

test('log lines carry who, key, old, new and time, and stay small', () => {
  const l = clipLog({ key: 'cpu.auto', old: true, new: false }, 'a'.repeat(500), 1234)
  assert.deepEqual(Object.keys(l).sort(), ['at', 'by', 'key', 'new', 'old'])
  assert.equal(l.at, 1234); assert.equal(l.by.length, 120); assert.equal(l.old, true); assert.equal(l.new, false)
})

test('wiring: admin only, one log line per change, same stores, history is one indexed field, rules deny the log', () => {
  const route = src('app/api/admin/settings/route.ts'), hist = src('app/api/admin/settings/history/route.ts'), lib = src('lib/server/adminSettings.ts')
  assert.match(route, /export async function GET/); assert.match(route, /export async function PATCH/)
  assert.equal((route.match(/requireAdmin/g) ?? []).length >= 3, true)
  assert.match(hist, /requireAdmin/)
  assert.match(lib, /for \(const c of changes\) batch\.set\(db\.collection\('settingsLog'\)\.doc\(\), clipLog\(c, who, at\)\)/)
  assert.match(lib, /if \(errors\.length\) throw/)
  assert.ok(lib.indexOf("throw Object.assign") < lib.indexOf('saveLimits(lim'), 'nothing is written before validation passes')
  assert.match(lib, /saveLimits\(lim, uid\)/); assert.match(lib, /doc\('cpuConfig'\)\.set\(cpu, \{ merge: true \}\)/); assert.match(lib, /saveConfig\(db,/)
  assert.match(lib, /orderBy\('at', 'desc'\)/)
  assert.doesNotMatch(lib + route + hist, /onSnapshot|setInterval/)
  assert.match(src('firestore.rules'), /match \/settingsLog\/\{id\} \{ allow read, write: if false; \}/)
})

test('every setting the page words (SETTING_UI) exists in this table, and the page can build a row from every setting', async () => {
  const { SETTING_UI, toRow } = await import('./settingsDefs.ts')
  for (const id of Object.keys(SETTING_UI)) assert.ok(BY_KEY.has(id), `${id} is worded on the page but missing from lib/adminSettings.ts`)
  for (const d of SETTINGS) {
    const { def } = toRow({ key: d.key, label: d.label, level: d.level, kind: d.kind, min: d.min, max: d.max, options: d.options, default: d.default, value: d.default, changed: false, changedAt: null, changedBy: null })
    assert.equal(def.id, d.key)
    if (d.kind === 'int' || d.kind === 'num') { assert.equal(def.min, d.min); assert.equal(def.max, d.max) }
  }
})
