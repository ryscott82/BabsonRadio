import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ADMIN_ACTIONS, CONTROL_FIELDS, EBOARD_ACTIONS, controlAccess } from './stationControls.ts'
import { APPROVE_ALL_MAX, approveAll, cleanIds } from './approveAll.ts'
import { PENDING_MAX, criticalOf, pendingFlags, shapeNext, shapePending, type PendingSource } from './todayData.ts'
import { ROLE_LABEL, STAFF_ONLY, roleLabel } from './roleLabel.ts'
import { FACTOR, PROTECTION_KEYS, PROTECTION_PARTS, presetValue, presetValues, protectionOf } from './protectionPresets.ts'
import { BY_KEY, SETTINGS, defaultsOf, planPatch, readValue, storeChanges } from './adminSettings.ts'
import { DEFAULT_THRESHOLDS } from './cpuTiers.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const HOUR = 3_600_000

// ── station controls ──
test('E-board can press every control on the Today page; the Admin-only ones stay Admin only', () => {
  for (const a of EBOARD_ACTIONS) {
    assert.equal(controlAccess('director', a), 'ok', a); assert.equal(controlAccess('admin', a), 'ok', a)
    assert.equal(controlAccess('student', a), 'forbidden', a); assert.equal(controlAccess('guest', a), 'forbidden', a)
  }
  for (const a of ADMIN_ACTIONS) { assert.equal(controlAccess('director', a), 'forbidden', a); assert.equal(controlAccess('admin', a), 'ok', a) }
  assert.deepEqual([...EBOARD_ACTIONS].sort(), ['announce', 'clear-announcement', 'color-mode', 'emergency-stop', 'on-air-sign', 'resume', 'skip'])
  assert.deepEqual([...ADMIN_ACTIONS].sort(), ['audio-fx', 'maintenance'])
  assert.equal(controlAccess('admin', 'format-disk'), 'unknown')
  assert.equal(CONTROL_FIELDS.director.includes('audioFx' as never), false)
  assert.equal(CONTROL_FIELDS.director.includes('maintenance' as never), false)
})

test('wiring: the controls and play-next routes are E-board routes, and the guard runs before any action', () => {
  const c = src('app/api/admin/controls/route.ts'), p = src('app/api/admin/play-next/route.ts')
  assert.match(c, /requireDirector/); assert.doesNotMatch(c, /requireStaff|requireAdmin/)
  assert.match(p, /requireDirector/); assert.doesNotMatch(p, /requireStaff|requireAdmin/)
  assert.ok(c.indexOf('controlAccess(level, action)') < c.indexOf("action === 'color-mode'"), 'checked before the first action')
  assert.ok(c.indexOf("allowed === 'forbidden'") < c.indexOf("if (action === 'maintenance')"))
  assert.match(c, /const pick = \(v: Record<string, unknown>, admin: boolean\)[\s\S]*audioFx[\s\S]*maintenance/)
  assert.match(c, /return pick\(out, admin\)/)
})

test('the colour-mode control can only change auto.colorChanging', () => {
  const lib = src('lib/server/autoschedule.ts')
  assert.match(lib, /tx\.update\(ref, \{ colorChanging: on, updatedAt: Timestamp\.now\(\), updatedBy: uid \}\)/)
  const body = lib.slice(lib.indexOf('export async function setColorMode'), lib.indexOf('/** Recurring weekly shows'))
  assert.doesNotMatch(body, /sanitizeConfig\(raw\)|\.\.\.cfg|timezone|horizonHours|syncToAzuraCast|playlistMap|weightOverrides|rules/, 'touches no other Auto DJ field')
  assert.match(body, /DEFAULT_CONFIG, colorChanging: on/, 'only when no config is saved yet does it start from the defaults')
  const route = src('app/api/admin/controls/route.ts')
  const handler = route.slice(route.indexOf("if (action === 'color-mode')"), route.indexOf("if (action === 'maintenance')"))
  assert.match(handler, /setColorMode\(adminDb\(\), on, t\.uid\)/); assert.doesNotMatch(handler, /saveConfig|body\.config|body\.rules/)
  assert.match(handler, /auto\.colorChanging/); assert.match(handler, /hostActions/)
})

test('every control writes a line to the station log (hostActions) or the settings history', () => {
  const c = src('app/api/admin/controls/route.ts')
  assert.ok((c.match(/collection\('hostActions'\)\.add/g) ?? []).length >= 6)
  assert.match(src('app/api/admin/play-next/route.ts'), /hostActions/)
})

// ── approve all ──
const fakeDeps = (rows: Record<string, { status: string; startAt: number } | null>, fail: Record<string, string> = {}) => {
  const log = { approved: [] as string[], mails: [] as string[], rebuilds: 0, peeked: [] as string[] }
  return {
    log,
    deps: {
      peek: async (ids: string[]) => { log.peeked.push(...ids); return new Map(ids.map(i => [i, rows[i] ?? null] as const)) },
      approve: async (id: string) => { if (fail[id]) throw new Error(fail[id]); log.approved.push(id); return id },
      reasonOf: (e: unknown) => (e instanceof Error ? e.message : 'x'),
      afterApproved: (m: string) => { log.mails.push(m) },
      rebuild: async () => { log.rebuilds++ },
    },
  }
}

test('approve all: only the given ids, soonest first, per-request reasons, one rebuild', async () => {
  const { deps, log } = fakeDeps({ a: { status: 'pending', startAt: 300 }, b: { status: 'pending', startAt: 100 }, c: { status: 'approved', startAt: 200 }, d: { status: 'pending', startAt: 150 }, other: { status: 'pending', startAt: 1 } },
    { d: 'That time is now taken by another approved slot.' })
  const r = await approveAll(['a', 'b', 'c', 'd', 'ghost'], deps)
  assert.deepEqual(log.peeked.sort(), ['a', 'b', 'c', 'd', 'ghost'], 'looks at nothing else')
  assert.deepEqual(log.approved, ['b', 'a'], 'start-time order; never "other"')
  assert.deepEqual(r.results, [
    { id: 'b', ok: true }, { id: 'd', ok: false, reason: 'That time is now taken by another approved slot.' }, { id: 'c', ok: false, reason: 'already handled' }, { id: 'a', ok: true },
    { id: 'ghost', ok: false, reason: 'not found' },
  ])
  assert.equal(log.rebuilds, 1); assert.deepEqual(log.mails, ['b', 'a'])
})

test('approve all: idempotent, and no rebuild when nothing was approved', async () => {
  const rows: Record<string, { status: string; startAt: number } | null> = { a: { status: 'pending', startAt: 1 } }
  const first = fakeDeps(rows)
  assert.deepEqual((await approveAll(['a'], first.deps)).results, [{ id: 'a', ok: true }])
  rows.a = { status: 'approved', startAt: 1 }
  const second = fakeDeps(rows)
  const again = await approveAll(['a'], second.deps)
  assert.deepEqual(again.results, [{ id: 'a', ok: false, reason: 'already handled' }])
  assert.equal(second.log.rebuilds, 0); assert.deepEqual(second.log.approved, [])
})

test('approve all: the list is validated (ids, no repeats, at most 50)', () => {
  assert.deepEqual(cleanIds(['a', 'a', 'b']), { ids: ['a', 'b'] })
  for (const bad of [undefined, 'a', [], [''], [1], ['a/b'], ['x'.repeat(101)]]) assert.ok('error' in cleanIds(bad), JSON.stringify(bad))
  assert.ok('ids' in cleanIds(Array.from({ length: APPROVE_ALL_MAX }, (_, i) => `i${i}`)))
  assert.ok('error' in cleanIds(Array.from({ length: APPROVE_ALL_MAX + 1 }, (_, i) => `i${i}`)))
})

test('wiring: approve-all is an E-board route that uses the shared approval and rebuilds in one place', () => {
  const r = src('app/api/admin/slots/approve-all/route.ts')
  assert.match(r, /requireDirector/); assert.doesNotMatch(r, /requireStaff|requireAdmin/)
  assert.match(r, /approveRequest\(db, id, \{ by: t\.uid \}\)/)
  assert.equal((r.match(/rebuildAutoSchedule/g) ?? []).length, 2, 'imported once, called once')
  assert.match(r, /slotDecisionMail/)
  assert.match(src('lib/approveAll.ts'), /if \(approved\) await d\.rebuild\(\)/)
})

// ── dashboard data ──
const pend = (o: Partial<PendingSource> = {}): PendingSource => ({
  id: 'r1', title: 'Late show', description: 'a talk show', location: '', requesterName: 'Sam', requesterUid: 'u1', startAt: 5 * HOUR, durationMin: 60, type: 'live',
  autoApproveAt: 6 * HOUR, autoBlockedReason: '', held: false, cleanHours: false, conductSigned: true, ...o,
})

test('pending rows: the listed fields only, soonest first, at most 20, flags for each reason', () => {
  const rows = Array.from({ length: 25 }, (_, i) => pend({ id: `r${i}`, startAt: (25 - i) * HOUR }))
  const out = shapePending(rows, () => false, () => false)
  assert.equal(out.rows.length, PENDING_MAX); assert.equal(out.total, 25); assert.equal(out.rows[0].id, 'r24')
  assert.deepEqual(Object.keys(out.rows[0]).sort(), ['autoApproveAt', 'autoBlockedReason', 'durationMin', 'flags', 'held', 'hostName', 'hostUid', 'id', 'startAt', 'strikes', 'title', 'type'])
  const f = pendingFlags({ explicit: true, minor: true, cleanHours: true, conductSigned: false, autoBlockedReason: 'conflict' })
  assert.deepEqual(f, ['explicit', 'minor', 'cleanHours', 'agreementUnsigned', 'conflict'])
  assert.deepEqual(pendingFlags({ explicit: false, minor: false, cleanHours: false, conductSigned: true, autoBlockedReason: '' }), [])
  assert.deepEqual(pendingFlags({ explicit: false, minor: false, cleanHours: false, conductSigned: null, autoBlockedReason: 'agreement' }), ['agreementUnsigned'])
  const one = shapePending([pend({ description: 'bad word' })], t => t.includes('bad'), u => u === 'u1').rows[0]
  assert.deepEqual(one.flags, ['explicit', 'minor'])
})

test('the dashboard never carries a phone number, whatever the stored documents hold', () => {
  const dirty = { ...pend(), phone: '+16175550100', phoneNumber: '617-555-0100', requesterPhone: '6175550100', email: 'x@y.com' } as PendingSource
  const hosts = new Map([['s1', { name: 'Sam', email: 'sam@babson.edu', phone: '+16175550100' } as { name: string; email: string }]])
  const feed = [
    { id: 'slot-s1', title: 'Sam show', startAt: 1 * HOUR, endAt: 2 * HOUR, source: 'slot', hosts: [], phone: '617-555-0100' },
    { id: 'weekly-w-1', title: 'Weekly', startAt: 3 * HOUR, endAt: 4 * HOUR, source: 'weekly', hosts: ['Alex'] },
    { id: 'auto-1', title: 'Lofi', startAt: 5 * HOUR, endAt: 6 * HOUR, source: 'auto', hosts: ['Should not show'] },
  ]
  const all = JSON.stringify({ pending: shapePending([dirty], () => false, () => false).rows, next: shapeNext(feed, hosts, 0) })
  assert.doesNotMatch(all, /phone/i); assert.doesNotMatch(all, /\d{3}[-. ]?\d{3}[-. ]?\d{4}/); assert.doesNotMatch(all, /\+1\d{10}/)
  const route = src('app/api/admin/dashboard/route.ts')
  assert.doesNotMatch(route, /phone/i, 'the route never reads a phone field')
  assert.match(route, /fieldMask: \['requesterName', 'requesterEmail'\]/); assert.match(route, /fieldMask: \['minor', 'strikeLevel', 'strikeUntil'\]/)
  assert.match(route, /< 20_000/, 'kept 20 s per instance')
})

test('hostEmail is only on real shows in the next 24 hours; Auto DJ blocks carry no host', () => {
  const hosts = new Map([['s1', { name: 'Sam', email: 'sam@babson.edu' }], ['s2', { name: 'Late', email: 'late@babson.edu' }]])
  const feed = [
    { id: 'slot-s1', title: 'Sam show', startAt: 1 * HOUR, endAt: 2 * HOUR, source: 'slot' },
    { id: 'slot-s2', title: 'Tomorrow', startAt: 30 * HOUR, endAt: 31 * HOUR, source: 'slot' },
    { id: 'weekly-w-1', title: 'Weekly', startAt: 3 * HOUR, endAt: 4 * HOUR, source: 'weekly', hosts: ['Alex', 'Jo'] },
    { id: 'auto-1', title: 'Lofi', startAt: 5 * HOUR, endAt: 6 * HOUR, source: 'auto', hosts: ['Nope'] },
    { id: 'slot-s3', title: 'No request on file', startAt: 7 * HOUR, endAt: 8 * HOUR, source: 'slot' },
  ]
  const next = shapeNext(feed, hosts, 0)
  assert.deepEqual(next.map(n => n.title), ['Sam show', 'Weekly', 'Lofi', 'No request on file'], 'tomorrow is not in the next 24 hours')
  assert.deepEqual(next[0], { title: 'Sam show', startAt: HOUR, endAt: 2 * HOUR, source: 'slot', hostName: 'Sam', hostEmail: 'sam@babson.edu' })
  assert.deepEqual(next[1], { title: 'Weekly', startAt: 3 * HOUR, endAt: 4 * HOUR, source: 'weekly', hostName: 'Alex, Jo' }, 'a weekly show has names but no email')
  assert.equal('hostName' in next[2] || 'hostEmail' in next[2], false)
  assert.equal('hostEmail' in next[3], false)
})

test('critical: site down, dead air and server time, from what the dashboard already read', () => {
  const ok = { configured: true, npTitle: 'Song', npPlayedAt: 5, deadAirActive: false, usage: { pct: 40, overall: 'normal' } }
  assert.deepEqual(criticalOf(ok), { siteDown: false, deadAir: false, serverTime: 'ok' })
  assert.equal(criticalOf({ ...ok, npTitle: '', npPlayedAt: 0 }).siteDown, true)
  assert.equal(criticalOf({ ...ok, configured: false, npTitle: '', npPlayedAt: 0 }).siteDown, false, 'a station that is not set up is not "down"')
  assert.equal(criticalOf({ ...ok, deadAirActive: true }).deadAir, true)
  assert.equal(criticalOf({ ...ok, usage: { pct: 89, overall: 'tight' } }).serverTime, 'ok')
  assert.equal(criticalOf({ ...ok, usage: { pct: 90, overall: 'tight' } }).serverTime, 'critical')
  assert.equal(criticalOf({ ...ok, usage: { pct: 50, overall: 'critical' } }).serverTime, 'critical')
  assert.equal(criticalOf({ ...ok, usage: { pct: 100, overall: 'critical' } }).serverTime, 'over')
  assert.equal(criticalOf({ ...ok, usage: null }).serverTime, 'ok')
  assert.deepEqual(Object.keys(criticalOf(ok)).sort(), ['deadAir', 'serverTime', 'siteDown'])
  const route = src('app/api/admin/dashboard/route.ts')
  assert.match(route, /critical: criticalOf/); assert.doesNotMatch(route, /setInterval|onSnapshot/)
})

// ── role label ──
test('the E-board label: shown for the stored value `director`, which does not change', () => {
  assert.equal(roleLabel('director'), 'E-board'); assert.equal(roleLabel('admin'), 'Admin'); assert.equal(roleLabel('student'), 'Student'); assert.equal(roleLabel('guest'), 'Guest')
  assert.equal(roleLabel('something-else'), 'something-else')
  assert.deepEqual(Object.keys(ROLE_LABEL), ['guest', 'student', 'director', 'admin'])
  assert.equal(STAFF_ONLY, 'E-board and admins only.')
  assert.match(src('lib/server/http.ts'), /need\(req, a => a\.level === 'director' \|\| a\.level === 'admin', STAFF_ONLY\)/)
  assert.match(src('lib/server/access.ts'), /'director'/, 'the stored value is untouched')
  for (const p of ['lib/server/studio.ts', 'lib/studioRules.ts', 'app/api/studio/sessions/route.ts', 'app/api/training/route.ts', 'app/api/studioaccess/route.ts', 'app/api/admin/studio/grant/route.ts']) {
    assert.doesNotMatch(src(p), /(HttpError\(\d+, |no\(\d+, '[A-Z0-9-]+', )['"`][^'"`]*\b[Dd]irector/, p)
  }
})

// ── protection presets ──
test('Normal is today\'s values, Relaxed is 1.25x, Strict is 0.75x, clamped to the server min and max', () => {
  const d = defaultsOf()
  for (const k of PROTECTION_KEYS) assert.equal(presetValues('normal')[k], d[k], k)
  for (const p of PROTECTION_PARTS) {
    const def = BY_KEY.get(p.key)!
    assert.equal(def.min, p.min, `${p.key} min matches the server`); assert.equal(def.max, p.max, `${p.key} max matches the server`)
    assert.equal(p.normal, def.default)
    for (const preset of ['relaxed', 'normal', 'strict'] as const) { const v = presetValue(p, preset); assert.ok(v >= p.min && v <= p.max, `${p.key} ${preset}`) }
  }
  assert.equal(presetValues('relaxed')['cpu.th.3.tight'], 0.625); assert.equal(presetValues('strict')['cpu.th.3.tight'], 0.375)
  assert.equal(presetValues('strict')['cpu.th.2.critical'], 0.675)
  assert.equal(presetValues('relaxed')['cpu.th.2.critical'], 1, 'a step that was 90% never becomes "never"')
  assert.equal(presetValues('relaxed')['cpu.th.1.critical'], 1)
  assert.equal(presetValues('relaxed')['cpu.th.1.tight'], 10, 'tier 1 tight is 9 (never) and stays above 1, clamped to the maximum')
  assert.equal(presetValues('strict')['cpu.th.1.tight'], 6.75)
  assert.equal(presetValues('relaxed')['cpu.reactionShare'], 0.313); assert.equal(presetValues('strict')['cpu.directAt'], 0.563)
  assert.deepEqual(FACTOR, { relaxed: 1.25, normal: 1, strict: 0.75 })
  assert.equal(DEFAULT_THRESHOLDS[3].tight, 0.5)
})

test('protection presets round trip and a hand-changed value reads as custom', () => {
  for (const preset of ['relaxed', 'normal', 'strict'] as const) {
    const v = presetValues(preset)
    assert.equal(protectionOf(k => v[k]), preset)
  }
  const v: Record<string, number> = { ...presetValues('normal'), 'cpu.th.3.tight': 0.55 }
  assert.equal(protectionOf(k => v[k]), 'custom')
  const doc = (p: 'relaxed' | 'normal' | 'strict') => { const x = presetValues(p); return { reactionShare: x['cpu.reactionShare'], directAt: x['cpu.directAt'], thresholds: Object.fromEntries([3, 2, 1].map(t => [t, { tight: x[`cpu.th.${t}.tight`], critical: x[`cpu.th.${t}.critical`] }])) } }
  const prot = BY_KEY.get('cpu.protection')!
  for (const p of ['relaxed', 'normal', 'strict'] as const) assert.equal(readValue(prot, doc(p)), p)
  assert.equal(readValue(prot, { ...doc('normal'), directAt: 0.8 }), 'custom')
  assert.equal(readValue(prot, undefined), 'normal', 'nothing saved = today\'s defaults = Normal')
})

test('one PATCH of a preset changes every underlying value, with one log change each and never the preset itself', () => {
  const current = { ...defaultsOf(), 'cpu.protection': 'normal' }
  const r = planPatch(current, { 'cpu.protection': 'strict' })
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.changes.map(c => c.key).sort(), [...PROTECTION_KEYS].sort())
  assert.equal(r.changes.every(c => c.old !== c.new), true)
  assert.equal(r.changes.some(c => c.key === 'cpu.protection'), false)
  assert.equal(r.changes.find(c => c.key === 'cpu.th.3.tight')!.new, 0.375)
  const custom = { ...defaultsOf(), 'cpu.protection': 'custom', 'cpu.th.3.tight': 0.55 }
  assert.deepEqual(planPatch(custom, { 'cpu.protection': 'normal' }).changes, [{ key: 'cpu.th.3.tight', old: 0.55, new: 0.5 }])
  assert.deepEqual(planPatch(current, { 'cpu.protection': 'normal' }).changes, [], 'already Normal: nothing to write')
  assert.deepEqual(planPatch(custom, { 'cpu.protection': null }).changes, [{ key: 'cpu.th.3.tight', old: 0.55, new: 0.5 }], 'reset goes to Normal')
  assert.ok(planPatch(current, { 'cpu.protection': 'custom' }).errors.length, 'Custom can be read but not chosen')
  assert.ok(planPatch(current, { 'cpu.protection': 'wild' }).errors.length)
  const both = planPatch(current, { 'cpu.th.3.tight': 0.4, 'cpu.protection': 'strict' })
  assert.equal(both.changes.find(c => c.key === 'cpu.th.3.tight')!.new, 0.4)
  assert.equal(both.changes.filter(c => c.key === 'cpu.th.3.tight').length, 1)
  assert.deepEqual(storeChanges('cpu', { directAt: 0.75 }, { directAt: 0.9 }), [{ key: 'cpu.directAt', old: 0.75, new: 0.9 }])
})

test('the preset is written in one go: one cpuConfig write, one settingsLog batch', () => {
  const lib = src('lib/server/adminSettings.ts')
  assert.equal((lib.match(/doc\('cpuConfig'\)\.set\(cpu, \{ merge: true \}\)/g) ?? []).length, 1)
  assert.match(lib, /await logSettingChanges\(db, changes, who\)/)
  assert.match(lib, /batch\.set\(db\.collection\('settingsLog'\)\.doc\(\), clipLog\(c, who, at\)\)/)
})

// ── visible and enforced ──
test('each row says where it shows (main or expert) and whether the server uses it', () => {
  for (const s of SETTINGS) { assert.ok(s.visible === 'main' || s.visible === 'expert', s.key); assert.equal(typeof s.enforced, 'boolean', s.key) }
  const main = SETTINGS.filter(s => s.visible === 'main').map(s => s.key)
  assert.deepEqual(main.sort(), [
    'cpu.budgetHours', 'cpu.protection', 'cpu.reactionsLocked', 'limits.guest.idleMin', 'limits.guest.quietEnabled', 'limits.guest.quietEnd', 'limits.guest.quietStart', 'limits.guest.sessionMaxMin',
    'limits.student.idleMin', 'limits.student.quietEnabled', 'limits.student.quietEnd', 'limits.student.quietStart', 'limits.student.sessionMaxMin', 'slots.afterHours', 'slots.weekLimit', 'studio.capacity',
  ])
  for (const w of ['student', 'guest']) for (const k of ['dailyCapMin', 'dailyAutoMin']) {
    const s = BY_KEY.get(`limits.${w}.${k}`)!; assert.equal(s.visible, 'expert'); assert.equal(s.enforced, false)
  }
  for (const k of ['limits.budgetEnabled', 'cpu.baseHours']) assert.equal(BY_KEY.get(k)!.visible, 'expert', k)
  assert.equal(SETTINGS.filter(s => !s.enforced).length, 4)
  assert.equal(BY_KEY.get('cpu.protection')!.virtual, true); assert.equal(BY_KEY.get('cpu.protection')!.default, 'normal')
  assert.match(src('app/api/admin/settings/route.ts'), /requireAdmin/, 'settings stay Admin only')
})

test('E-board can message the site but cannot send push notifications', async () => {
  const { readFileSync } = await import('node:fs')
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  // Push to a person's own phone and the ops pushes stay Admin only (requireStaff is requireAdmin). The station announcement (broadcast) is E-board and Admin.
  const push = src('app/api/admin/push/route.ts')
  assert.ok(push.includes('requireStaff') && !push.includes('requireDirector'))
  const bc = src('app/api/admin/broadcast/route.ts')
  assert.ok(bc.includes('requireDirector') && !bc.includes('requireStaff'))
  // The announcement banner is a site message: E-board allowed, and it sends no push.
  const c = src('app/api/admin/controls/route.ts')
  assert.ok(c.includes('requireDirector'))
  assert.equal(controlAccess('director', 'announce'), 'ok')
  assert.equal(controlAccess('director', 'clear-announcement'), 'ok')
  assert.ok(!/notifyAnnouncements/.test(c))
  assert.ok(!/notifyAnnouncements/.test(src('lib/server/announcement.ts')))
})

test('site messages are written to the audit log with who, what and when', () => {
  const c = src('app/api/admin/controls/route.ts')
  assert.match(c, /action: String\(action\)[^\n]*detail:/)
  const n = src('app/api/live/note/route.ts')
  assert.ok(n.includes("logNote('show-message'") && n.includes("logNote('show-message-clear'"))
  assert.ok(n.includes('uid: c.t.uid'))
})
