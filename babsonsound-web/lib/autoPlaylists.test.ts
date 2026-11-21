import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, activePlaylists, planAutoBlocks, poolOf, sanitizeConfig } from './autoschedule.ts'

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
