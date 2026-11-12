import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ADMIN_FIELDS, DEFAULT_CONFIG, DIRECTOR_FIELDS, applyDirectorSave, directorView, forbiddenForDirector, planAutoBlocks, sanitizeConfig, type AutoConfig,
} from './autoschedule.ts'
import { BY_KEY, SETTINGS, autoChanges, checkValue, defaultsOf, planPatch, readValue, storeChanges } from './adminSettings.ts'
import { DEFAULT_AUTO_RULES, autoApproveAtMs, cleanWeeks, evaluateAuto } from './slotAuto.ts'
import { SLOT_RANGE, readSlotRules } from './slotRulesCore.ts'
import { directorWordsPlan, levelChanges, normalizeWords } from './wordFilterAccess.ts'
import { CONDUCT_VERSION } from './conduct.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const HOUR = 3_600_000

// A saved config with every Admin-only value set to something other than the default, so any overwrite shows.
const saved = (): AutoConfig => sanitizeConfig({
  ...DEFAULT_CONFIG, enabled: false, timezone: 'America/Chicago', horizonHours: 72, stepMinutes: 60, maxBlockMinutes: 180, lockMinutes: 30, learn: false,
  colorChanging: true, syncToAzuraCast: true, playlistMap: { 'Lofi Beats': 'Lofi (live)' }, weightOverrides: { jazz: 2 },
})
const newRules = [{ id: 'r1', name: 'Mornings', days: [1, 2], start: '08:00', end: '10:00', fillers: ['Indie Folk'], priority: 5 }]

test('the field lists cover the whole config, with no field in both', () => {
  const all = Object.keys(DEFAULT_CONFIG).sort()
  assert.deepEqual([...DIRECTOR_FIELDS, ...ADMIN_FIELDS].sort(), all)
  assert.equal(DIRECTOR_FIELDS.some(f => (ADMIN_FIELDS as readonly string[]).includes(f)), false)
})

test('a Director cannot send any Admin-only field, even with the same value, and the error names them', () => {
  for (const f of ADMIN_FIELDS) assert.deepEqual(forbiddenForDirector({ [f]: (DEFAULT_CONFIG as unknown as Record<string, unknown>)[f] }), [f], f)
  for (const f of ['timezone', 'horizonHours', 'stepMinutes', 'lockMinutes', 'syncToAzuraCast', 'playlistMap', 'weightOverrides', 'enabled']) assert.ok(forbiddenForDirector({ [f]: 1 }).length, f)
  assert.deepEqual(forbiddenForDirector({ rules: [], defaultFillers: ['x'] }), [])
  assert.deepEqual(forbiddenForDirector({ rules: [], calendarUrl: 'x', extra: 1 }), ['calendarUrl', 'extra'])
})

test('a Director save changes only rules and default fillers; a stale copy of the Admin values cannot put old ones back', () => {
  const now = saved()
  // The Director's page loaded long ago: it holds the defaults for everything Admin-only. Even if those were sent, the merge ignores them.
  const stale = { ...DEFAULT_CONFIG, rules: newRules, defaultFillers: ['Acoustic'] }
  const out = applyDirectorSave(now, stale)
  for (const f of ADMIN_FIELDS) assert.deepEqual(out[f], now[f], f)
  assert.equal(out.rules.length, 1); assert.equal(out.rules[0].id, 'r1'); assert.deepEqual(out.defaultFillers, ['Acoustic'])
  // Rules left out keep the saved rules.
  assert.deepEqual(applyDirectorSave(now, { defaultFillers: ['Acoustic'] }).rules, now.rules)
})

test('a Director save still goes through sanitizeConfig, and a per-rule off switch is kept', () => {
  const out = applyDirectorSave(saved(), { rules: [{ ...newRules[0], enabled: false, priority: 999, name: 'x'.repeat(200) }, { id: 'bad', start: 'zz', end: '10:00', days: [1], fillers: ['a'] }] })
  assert.equal(out.rules.length, 1)
  assert.equal(out.rules[0].enabled, false); assert.equal(out.rules[0].priority, 100); assert.equal(out.rules[0].name.length, 60)
  assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, rules: [{ ...newRules[0] }] }).rules[0].enabled, undefined, 'on is the default and is not stored')
})

test('a rule that is switched off is not used when planning', () => {
  const plan = (enabled: boolean) => planAutoBlocks({
    cfg: sanitizeConfig({ ...DEFAULT_CONFIG, defaultFillers: ['Default Mix'], rules: [{ id: 'all', name: 'All day', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00', fillers: ['Only Rule'], priority: 5, enabled }] }),
    fromMs: Date.UTC(2026, 10, 16, 15), untilMs: Date.UTC(2026, 10, 16, 18), busy: [], weekly: [],
  })
  assert.ok(plan(true).every(b => b.label === 'Only Rule'))
  assert.ok(plan(false).every(b => b.label === 'Default Mix'))
})

test('an Admin can change everything', () => {
  const next = sanitizeConfig({ ...saved(), enabled: true, timezone: 'America/Denver', horizonHours: 24, stepMinutes: 15, maxBlockMinutes: 90, lockMinutes: 0, learn: true, colorChanging: false, syncToAzuraCast: false, playlistMap: {}, weightOverrides: {} })
  assert.equal(next.timezone, 'America/Denver'); assert.equal(next.horizonHours, 24); assert.equal(next.stepMinutes, 15); assert.equal(next.lockMinutes, 0)
  assert.equal(next.enabled, true); assert.equal(next.syncToAzuraCast, false); assert.deepEqual(next.playlistMap, {})
})

test('a Director GET carries the rules, default fillers and a read-only on/off, and nothing else', () => {
  const v = directorView({ ...saved(), rules: sanitizeConfig({ rules: newRules }).rules })
  assert.deepEqual(Object.keys(v).sort(), ['defaultFillers', 'enabled', 'rules'])
  const text = JSON.stringify(v)
  for (const secret of ['Lofi (live)', 'America/Chicago', 'playlistMap', 'weightOverrides', 'calendar', 'apiKey', 'AZURACAST', 'timezone', 'syncToAzuraCast']) assert.equal(text.includes(secret), false, secret)
})

test('wiring: Auto DJ routes use the Director and Admin guards the plan asks for', () => {
  const route = src('app/api/admin/autoschedule/route.ts'), run = src('app/api/admin/autoschedule/run/route.ts'), az = src('app/api/admin/autoschedule/azuracast/route.ts')
  assert.match(route, /requireDirector/); assert.doesNotMatch(route, /requireStaff|requireAdmin/)
  assert.match(route, /if \(\(await accessOf\(t\)\)\.level !== 'admin'\) return \{ role: 'director', config: directorView\(cfg\) \}/)
  assert.ok(route.indexOf('calendarUrl') > route.indexOf("role: 'director'"), 'the calendar link is only in the Admin branch')
  assert.match(route, /throw new HttpError\(403/)
  assert.ok(route.indexOf('forbiddenForDirector') < route.indexOf('saveConfigAs('), 'refused before anything is saved')
  assert.match(run, /requireDirector/); assert.doesNotMatch(run, /requireStaff|requireAdmin/)
  assert.equal((az.match(/await requireStaff\(req\)/g) ?? []).length, 2); assert.doesNotMatch(az, /requireDirector/)
  const lib = src('lib/server/autoschedule.ts')
  assert.match(lib, /saveConfigAs[\s\S]*runTransaction[\s\S]*tx\.get\(ref\)[\s\S]*applyDirectorSave\(before, raw\)[\s\S]*tx\.set\(ref/)
  assert.match(lib, /updatedBy: who\.uid/)
})

test('wiring: schedule, events and schedule-correction stay Director routes', () => {
  for (const p of ['app/api/admin/schedule/route.ts', 'app/api/admin/events/route.ts', 'app/api/admin/schedule-correction/route.ts']) {
    const s = src(p)
    assert.match(s, /requireDirector/, p); assert.doesNotMatch(s, /requireStaff|requireAdmin/, p)
  }
})

test('blocked words: a Director can add, cannot remove, cannot change strictness; an Admin keeps full control', () => {
  const savedWords = ['alpha', 'beta']
  const add = directorWordsPlan(savedWords, ['Alpha', 'beta', ' gamma ', 'a'])
  assert.deepEqual(add, { ok: true, words: ['alpha', 'beta', 'gamma'], added: ['gamma'] })
  assert.deepEqual(directorWordsPlan(savedWords, ['alpha']), { ok: false, removed: ['beta'] })
  assert.deepEqual(directorWordsPlan(savedWords, []), { ok: false, removed: ['alpha', 'beta'] })
  assert.deepEqual(directorWordsPlan(savedWords, 'nope'), { ok: false, removed: ['alpha', 'beta'] })
  assert.equal(levelChanges('explicit', 'crude'), true); assert.equal(levelChanges('explicit', 'explicit'), false); assert.equal(levelChanges('explicit', undefined), false)
  assert.deepEqual(normalizeWords(['A', 'a', 'bb', 'x'.repeat(60)]), ['a'.length === 1 ? 'a' : '', 'bb', 'x'.repeat(40)].filter(w => w.length >= 2))
  const route = src('app/api/admin/blocked-words/route.ts'), lib = src('lib/server/wordFilter.ts')
  assert.match(route, /requireDirector/); assert.doesNotMatch(route, /requireStaff/)
  assert.match(route, /admin \? await saveBlocked\(adminDb\(\), b\.words, t\.uid, b\.level\) : await addBlockedWords/)
  assert.match(lib, /addBlockedWords[\s\S]*runTransaction[\s\S]*levelChanges[\s\S]*directorWordsPlan/)
  assert.match(lib, /const custom = normalizeWords\(input\)/, 'the Admin save cleans words the same way as before')
})

test('Auto DJ saves by an Admin list one change per value, in the same shape as PATCH', () => {
  const before = saved(), after = sanitizeConfig({ ...before, horizonHours: 24, learn: true, timezone: 'America/Denver', playlistMap: { A: 'B' }, rules: newRules })
  const ch = autoChanges(before, after)
  assert.deepEqual(ch.map(c => c.key).sort(), ['auto.horizonHours', 'auto.learn', 'auto.playlistMap', 'auto.timezone'])
  assert.deepEqual(ch.find(c => c.key === 'auto.horizonHours'), { key: 'auto.horizonHours', old: 72, new: 24 })
  assert.deepEqual(ch.find(c => c.key === 'auto.timezone'), { key: 'auto.timezone', old: 'America/Chicago', new: 'America/Denver' })
  assert.deepEqual(autoChanges(before, before), [], 'nothing changed, nothing logged')
  assert.deepEqual(autoChanges(before, { ...before, rules: [] }), [], 'rules are the Director part and are not listed')
  assert.ok(autoChanges(before, { ...before, playlistMap: { k: 'v'.repeat(900) } })[0].new.toString().length <= 300, 'stays small')
  const route = src('app/api/admin/autoschedule/route.ts')
  assert.match(route, /if \(admin\) await logSettingChanges\(db, autoChanges\(before, after\)/)
})

test('the listening-limits and CPU saves list what changed too', () => {
  const a = { ...defaultsOf() } as Record<string, unknown>
  void a
  const lim = (n: number) => ({ budgetEnabled: false, refreshSec: n, student: { idleMin: 60, sessionMaxMin: 360, dailyCapMin: 0, dailyAutoMin: 0, quietEnabled: true, quietStart: 2, quietEnd: 6 }, guest: { idleMin: 60, sessionMaxMin: 360, dailyCapMin: 0, dailyAutoMin: 0, quietEnabled: true, quietStart: 2, quietEnd: 6 } })
  assert.deepEqual(storeChanges('limits', lim(720), lim(600)), [{ key: 'limits.refreshSec', old: 720, new: 600 }])
  assert.deepEqual(storeChanges('cpu', { directAt: 0.75 }, { directAt: 0.9 }), [{ key: 'cpu.directAt', old: 0.75, new: 0.9 }])
  for (const p of ['app/api/admin/listening-limits/route.ts', 'app/api/admin/cpu/route.ts']) assert.match(src(p), /logSettingChanges/, p)
})

// ── show auto-approval settings ──
test('show auto-approval settings: defaults are the old constants, bounds are enforced, and they are Admin settings', () => {
  assert.deepEqual(DEFAULT_AUTO_RULES, { afterHours: 24, beforeStartHours: 12, weekLimit: 1, maxRepeatWeeks: 3, minLeadHours: 24 })
  const keys = ['afterHours', 'beforeStartHours', 'weekLimit', 'maxRepeatWeeks', 'minLeadHours'] as const
  for (const k of keys) {
    const def = BY_KEY.get(`slots.${k}`)!
    assert.ok(def, k); assert.equal(def.default, DEFAULT_AUTO_RULES[k]); assert.equal(def.level, 3)
    const [lo, hi] = SLOT_RANGE[k]
    assert.equal(checkValue(def, lo).ok, true); assert.equal(checkValue(def, hi).ok, true)
    assert.equal(checkValue(def, lo - 1).ok, false); assert.equal(checkValue(def, hi + 1).ok, false); assert.equal(checkValue(def, 1.5).ok, false)
  }
  assert.deepEqual([SLOT_RANGE.afterHours, SLOT_RANGE.weekLimit, SLOT_RANGE.maxRepeatWeeks], [[1, 72], [1, 7], [0, 8]])
  const r = planPatch(defaultsOf(), { 'slots.weekLimit': 2, 'slots.afterHours': null })
  assert.deepEqual(r.changes, [{ key: 'slots.weekLimit', old: 1, new: 2 }])
  assert.equal(planPatch({ ...defaultsOf(), 'slots.afterHours': 48 }, { 'slots.afterHours': null }).changes[0].new, 24, 'reset goes back to 24')
  assert.equal(SETTINGS.filter(s => s.store === 'slots').length, 5)
  assert.match(src('app/api/admin/settings/route.ts'), /requireAdmin/)
})

test('stored values outside the range, or not whole numbers, fall back to the default', () => {
  assert.deepEqual(readSlotRules(undefined), DEFAULT_AUTO_RULES)
  assert.deepEqual(readSlotRules({ afterHours: 48, weekLimit: 99, maxRepeatWeeks: 0, minLeadHours: 'x', beforeStartHours: 2.5 }), { ...DEFAULT_AUTO_RULES, afterHours: 48, maxRepeatWeeks: 0 })
  assert.equal(readValue(BY_KEY.get('slots.weekLimit')!, { weekLimit: 3 }), 3)
})

test('approval honors a changed value: the time it approves itself, the weekly limit, the repeat weeks', () => {
  const created = Date.UTC(2026, 10, 1, 12), start = created + 10 * 24 * HOUR
  assert.equal(autoApproveAtMs(created, start), created + 24 * HOUR)
  assert.equal(autoApproveAtMs(created, start, { afterHours: 6, beforeStartHours: 12 }), created + 6 * HOUR)
  assert.equal(autoApproveAtMs(created, created + 20 * HOUR, { afterHours: 24, beforeStartHours: 4 }), created + 16 * HOUR, 'capped before the show')
  const base = {
    now: Date.UTC(2026, 10, 3), status: 'pending', held: false, autoApproveAt: Date.UTC(2026, 10, 2), startMs: Date.UTC(2026, 10, 9), type: 'live',
    requester: { level: 'student', conductVersion: CONDUCT_VERSION, radioTrained: true, radioExpiresAt: null }, conductVersion: CONDUCT_VERSION, conflict: false,
  }
  assert.deepEqual(evaluateAuto({ ...base, autoStartsInWeek: 1 }), { action: 'skip', reason: 'week-limit' }, 'default: one a week')
  assert.deepEqual(evaluateAuto({ ...base, autoStartsInWeek: 1, rules: { weekLimit: 2 } }), { action: 'approve' })
  assert.deepEqual(evaluateAuto({ ...base, autoStartsInWeek: 2, rules: { weekLimit: 2 } }), { action: 'skip', reason: 'week-limit' })
  assert.equal(cleanWeeks(3), 3); assert.equal(cleanWeeks(4), null); assert.equal(cleanWeeks(4, 8), 4); assert.equal(cleanWeeks(1, 0), null); assert.equal(cleanWeeks(0, 0), 0)
})

test('wiring: the request, repeat, options and approval code read the saved numbers (cached 20 s), not the constants', () => {
  const lib = src('lib/server/slotRules.ts')
  assert.match(lib, /config/); assert.match(lib, /slotRules/); assert.match(lib, /20_000/)
  assert.match(src('lib/server/slotApproval.ts'), /loadSlotRules\(db\)[\s\S]*rules,/)
  const create = src('lib/server/slotCreate.ts')
  assert.match(create, /rules\.minLeadHours/); assert.match(create, /autoApproveAtMs\(now, s, rules\)/); assert.doesNotMatch(create, /SLOT_RULES\.minLeadHours/)
  assert.match(src('app/api/slots/request/route.ts'), /cleanWeeks\(b\.repeatWeeks, rules\.maxRepeatWeeks\)/)
  assert.match(src('app/api/slots/repeat/route.ts'), /cleanWeeks\(b\.weeks, max\)/)
  const opt = src('app/api/slots/options/route.ts')
  for (const k of ['sr.afterHours', 'sr.beforeStartHours', 'sr.weekLimit', 'sr.maxRepeatWeeks', 'sr.minLeadHours']) assert.match(opt, new RegExp(k.replace('.', '\\.')), k)
  assert.doesNotMatch(opt, /AUTO\.(afterHours|beforeStartHours|weekLimit|maxRepeatWeeks)/)
  const sets = src('lib/server/adminSettings.ts')
  assert.match(sets, /doc\('slotRules'\)\.set\(\{ \.\.\.slots/); assert.match(sets, /resetSlotRules\(\)/)
})
