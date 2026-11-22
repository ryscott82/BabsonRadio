import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, activePlaylists, planAutoBlocks, poolOf, sanitizeConfig } from './autoschedule.ts'

const PL = (...n: string[]) => n.map(name => ({ name }))
const names = (c: { playlists?: { name: string }[] }) => (c.playlists ?? []).map(p => p.name)
const plan = (cfg: ReturnType<typeof sanitizeConfig>) => planAutoBlocks({ cfg, fromMs: Date.UTC(2026, 10, 16, 15), untilMs: Date.UTC(2026, 10, 16, 18), busy: [], weekly: [] })

test('a saved config from before the catalog keeps only Jazz House for Studying and Pop Hits', () => {
  const old = { ...DEFAULT_CONFIG, playlists: undefined, defaultFillers: ['Rock', 'Pop Hits', 'Lofi'] } as unknown
  const c = sanitizeConfig(old)
  assert.deepEqual(names(c), ['Jazz House for Studying', 'Pop Hits'])
  assert.deepEqual(c.defaultFillers, ['Pop Hits'])
})

test('playlists are unique ignoring case, capped, and never called Auto DJ', () => {
  const c = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: [{ name: 'Pop Hits' }, { name: ' pop hits ' }, { name: 'Auto DJ' }, { name: 'Rock', enabled: false }] })
  assert.deepEqual(names(c), ['Pop Hits', 'Rock'])
  assert.equal(c.playlists?.[1].enabled, false)
  const many = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: Array.from({ length: 80 }, (_, i) => ({ name: `P${i}` })) })
  assert.equal(many.playlists?.length, 40)
})

test('a rule whose playlists were all deleted falls back to every playlist; an excluded one stays in the rule', () => {
  const c = sanitizeConfig({
    ...DEFAULT_CONFIG, playlists: [{ name: 'Pop Hits' }, { name: 'Jazz', enabled: false }],
    rules: [{ id: 'a', name: 'A', days: [1], start: '08:00', end: '10:00', fillers: ['Gone'], priority: 5 }, { id: 'b', name: 'B', days: [1], start: '10:00', end: '12:00', fillers: ['Jazz'], priority: 5 }],
  })
  assert.deepEqual(c.rules.find(r => r.id === 'a')?.fillers, ['Pop Hits', 'Jazz'])
  assert.deepEqual(c.rules.find(r => r.id === 'b')?.fillers, ['Jazz'])
})

test('activePlaylists leaves out excluded ones, and poolOf drops them but falls back to all active', () => {
  const c = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: [{ name: 'Pop Hits' }, { name: 'Jazz', enabled: false }, { name: 'Rock' }] })
  assert.deepEqual(activePlaylists(c), ['Pop Hits', 'Rock'])
  assert.deepEqual(poolOf(['Jazz', 'Rock'], c), ['Rock'])
  assert.deepEqual(poolOf(['Jazz'], c), ['Pop Hits', 'Rock'])
})

test('planning never picks an excluded playlist, and plans nothing when none is active', () => {
  const base = { ...DEFAULT_CONFIG, defaultFillers: ['Jazz', 'Pop Hits'], rules: [] }
  const some = plan(sanitizeConfig({ ...base, playlists: [{ name: 'Pop Hits' }, { name: 'Jazz', enabled: false }] }))
  assert.ok(some.length > 0 && some.every(b => b.label === 'Pop Hits'))
  const none = plan(sanitizeConfig({ ...base, playlists: [{ name: 'Pop Hits', enabled: false }, { name: 'Jazz', enabled: false }] }))
  assert.equal(none.length, 0)
})

// ── The mix and the manual grid ──
import { PARTS, QUIET, gridKey, mixOf, normalizeMix, partOf, setShare } from './autoschedule.ts'

const WEEK = 7 * 24 * 3_600_000
const week = (cfg: ReturnType<typeof sanitizeConfig>) => planAutoBlocks({ cfg, fromMs: Date.UTC(2026, 10, 15, 5), untilMs: Date.UTC(2026, 10, 15, 5) + WEEK, busy: [], weekly: [] })
const hoursOf = (bs: { startMs: number; endMs: number; label: string }[], f: string) => bs.filter(b => b.label === f).reduce((a, b) => a + (b.endMs - b.startMs) / 3_600_000, 0)
const ALL = (v: number) => ({ morning: v, afternoon: v, evening: v, weekdayNight: v, weekendNight: v })

test('five parts of the week, a night belongs to the day it starts', () => {
  assert.equal(PARTS.length, 5)
  assert.equal(partOf(1, 6 * 60), 'morning'); assert.equal(partOf(1, 12 * 60), 'afternoon'); assert.equal(partOf(1, 17 * 60), 'evening')
  assert.equal(partOf(1, 21 * 60), 'weekdayNight'); assert.equal(partOf(3, 21 * 60), 'weekdayNight') // Wed night
  assert.equal(partOf(4, 21 * 60), 'weekendNight'); assert.equal(partOf(5, 2 * 60), 'weekendNight') // Thu night, and Fri 2am is still Thursday's
  assert.equal(partOf(5, 21 * 60), 'weekendNight'); assert.equal(partOf(6, 23 * 60), 'weekendNight')
  assert.equal(partOf(0, 2 * 60), 'weekendNight') // Sunday 2am is still Saturday's night
  assert.equal(partOf(4, 2 * 60), 'weekdayNight')  // Thursday 2am is Wednesday's night
  assert.equal(partOf(6, 2 * 60), 'weekendNight')  // Saturday 2am is Friday's night
  assert.equal(partOf(1, 2 * 60), 'weekdayNight')  // Monday 2am is Sunday's night
})

test('with nothing set by hand the mix fills the week, and a number is how often it plays', () => {
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('A', 'B'), mix: { a: ALL(1), b: ALL(0.5) } })
  const bs = week(cfg)
  const a = hoursOf(bs, 'A'), b = hoursOf(bs, 'B')
  assert.ok(a > 0 && b > 0)
  assert.ok(Math.abs(a / b - 2) < 0.25, `A ${a}h vs B ${b}h`)
})

test('each part adds up to exactly 1 whatever was saved, and a part of all zeros becomes equal shares', () => {
  const c = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('A', 'B', 'C'), mix: { a: { morning: 1, afternoon: 0, evening: 0.3 }, b: { morning: 1, afternoon: 0, evening: 0.3 }, c: { morning: 1, afternoon: 0, evening: 0.3 } } })
  for (const part of ['morning', 'afternoon', 'evening', 'weekdayNight', 'weekendNight'] as const) {
    const sum = ['A', 'B', 'C'].reduce((x, n) => x + Math.round(mixOf(c, n, part) * 100), 0)
    assert.equal(sum, 100, part)
  }
  assert.equal(mixOf(c, 'A', 'afternoon') + mixOf(c, 'B', 'afternoon') + mixOf(c, 'C', 'afternoon') > 0.99, true)
  assert.deepEqual(['A', 'B', 'C'].map(n => mixOf(c, n, 'morning')), [0.34, 0.33, 0.33])
})

test('moving one share rescales the others, which keep their relative sizes; 0 means never; a lone playlist is always 1', () => {
  const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('A', 'B', 'C'), mix: { a: ALL(0.5), b: ALL(0.3), c: ALL(0.2) } })
  const mix = setShare(cfg, 'A', 'evening', 0.7)
  const at = (n: string) => mix[n.toLowerCase()].evening ?? 0
  assert.equal(at('A'), 0.7)
  assert.ok(Math.abs(at('A') + at('B') + at('C') - 1) < 1e-9)
  assert.ok(Math.abs(at('B') / at('C') - 1.5) < 0.2)
  assert.equal(mix.a.morning, 0.5, 'other parts are untouched')
  const zero = setShare(cfg, 'A', 'evening', 0)
  assert.equal(zero.a.evening, 0)
  assert.ok(Math.abs((zero.b.evening ?? 0) + (zero.c.evening ?? 0) - 1) < 1e-9)
  const lone = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('Solo'), mix: {} })
  assert.equal(mixOf(lone, 'Solo', 'morning'), 1)
  assert.equal(setShare(lone, 'Solo', 'morning', 0.2).solo.morning, 1)
})

test('adding a playlist gives it a share and the others shrink; removing one hands its share back', () => {
  const two = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('Pop Hits', 'Jazz House for Studying') })
  const three = normalizeMix(two.mix, PL('Pop Hits', 'Jazz House for Studying', 'New'))
  for (const part of ['morning', 'weekendNight'] as const) assert.equal(Math.round(Object.values(three).reduce((x, r) => x + (r[part] ?? 0), 0) * 100), 100)
  assert.ok((three['new'].morning ?? 0) > 0.2)
  const back = normalizeMix(three, PL('Pop Hits', 'Jazz House for Studying'))
  assert.equal(Math.round(Object.values(back).reduce((x, r) => x + (r.morning ?? 0), 0) * 100), 100)
})

test('an hour set by hand wins over the mix, QUIET schedules nothing, an excluded playlist in the grid is ignored', () => {
  const key = gridKey(1, 10) // Monday 10am (station time)
  const base = { ...DEFAULT_CONFIG, playlists: PL('A', 'B'), mix: { a: ALL(1), b: ALL(0) } }
  const at = (cfg: ReturnType<typeof sanitizeConfig>) => planAutoBlocks({ cfg, fromMs: Date.UTC(2026, 10, 16, 14), untilMs: Date.UTC(2026, 10, 16, 17), busy: [], weekly: [] }) // Mon Nov 16, 9am–12pm EST
  assert.ok(at(sanitizeConfig(base)).every(b => b.label === 'A'))
  const set = at(sanitizeConfig({ ...base, grid: { [key]: 'b' } }))
  assert.deepEqual(set.filter(b => b.label === 'B').map(b => (b.endMs - b.startMs) / 3_600_000), [1])
  assert.equal(sanitizeConfig({ ...base, grid: { [key]: 'b' } }).grid[key], 'B', 'saved under the playlist list spelling')
  const quiet = at(sanitizeConfig({ ...base, grid: { [key]: QUIET } }))
  assert.equal(quiet.some(b => b.startMs <= Date.UTC(2026, 10, 16, 15) && b.endMs > Date.UTC(2026, 10, 16, 15)), false)
  const off = at(sanitizeConfig({ ...base, playlists: [{ name: 'A' }, { name: 'B', enabled: false }], grid: { [key]: 'B' } }))
  assert.ok(off.every(b => b.label === 'A'))
})

test('the saved mix is cleaned: 0 to 1, gaps get defaults, deleted playlists are dropped, junk grid cells are dropped', () => {
  const c = sanitizeConfig({ ...DEFAULT_CONFIG, playlists: PL('Pop Hits', 'New One'), mix: { 'pop hits': { morning: 7, afternoon: -2, evening: 'x' }, gone: { morning: 1 } }, grid: { '1-10': 'Pop Hits', '9-1': 'Pop Hits', '1-30': 'Pop Hits', '1-5': 'Deleted' } })
  assert.equal(mixOf(c, 'Pop Hits', 'afternoon'), 0)         // -2 is 0 and the other playlist takes the whole part
  assert.equal(mixOf(c, 'New One', 'afternoon'), 1)
  assert.ok(mixOf(c, 'Pop Hits', 'evening') > 0 && mixOf(c, 'Pop Hits', 'evening') < 1) // junk falls back to a default share
  assert.ok(mixOf(c, 'New One', 'weekendNight') > 0)       // a playlist with no saved numbers still gets a share
  assert.equal('gone' in c.mix, false)
  assert.deepEqual(c.grid, { '1-10': 'Pop Hits' })
})

test('an old saved config loses the four stock blocks (the mix replaces them) but keeps its own', () => {
  const stock = ['study-night', 'party-night', 'wake-up', 'weekday-morning'].map(id => ({ id, name: id, days: [1], start: '08:00', end: '10:00', fillers: ['Pop Hits'], priority: 5 }))
  const mine = { id: 'mine', name: 'Mine', days: [2], start: '08:00', end: '10:00', fillers: ['Pop Hits'], priority: 5 }
  const old = sanitizeConfig({ ...DEFAULT_CONFIG, mix: undefined, rules: [...stock, mine] })
  assert.deepEqual(old.rules.map(r => r.id), ['mine'])
  const now = sanitizeConfig({ ...DEFAULT_CONFIG, rules: [...stock, mine] }) // once a mix exists nothing is dropped
  assert.equal(now.rules.length, 5)
})

import { colorOnByDefault } from './autoschedule.ts'
test('album colors come on by themselves on weekend nights, unless the setting is off', () => {
  const tz = 'America/New_York', at = (y: number, m: number, d: number, h: number) => Date.UTC(y, m - 1, d, h + 5) // EST
  const c = { colorChanging: false, colorWeekendNights: true, timezone: tz }
  assert.equal(colorOnByDefault(c, at(2026, 11, 19, 22)), true)   // Thu 10pm
  assert.equal(colorOnByDefault(c, at(2026, 11, 21, 1)), true)    // Sat 1am (Fri's night)
  assert.equal(colorOnByDefault(c, at(2026, 11, 18, 22)), false)  // Wed 10pm
  assert.equal(colorOnByDefault(c, at(2026, 11, 20, 14)), false)  // Fri 2pm
  assert.equal(colorOnByDefault({ ...c, colorWeekendNights: false }, at(2026, 11, 19, 22)), false)
  assert.equal(colorOnByDefault({ ...c, colorChanging: true, colorWeekendNights: false }, at(2026, 11, 18, 22)), true, 'the old always-on switch still works')
  assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, colorWeekendNights: undefined }).colorWeekendNights, true)
  assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, colorWeekendNights: false }).colorWeekendNights, false)
})
