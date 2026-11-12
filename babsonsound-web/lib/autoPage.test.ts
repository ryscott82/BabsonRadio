import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, DIRECTOR_FIELDS, ADMIN_FIELDS } from './autoschedule.ts'
import { adminOnlyField, directorMayChange, fullConfig, plainSaveError, savePayload, showsAdvanced } from './autoPage.ts'

test("a Director's save sends only the Director fields, even when the page holds more", () => {
  const cfg = { ...DEFAULT_CONFIG, timezone: 'Europe/Paris', learn: false, weightOverrides: { pop: 2 } }
  const body = savePayload(cfg, 'director')
  assert.deepEqual(Object.keys(body), ['config'])
  assert.deepEqual(Object.keys(body.config).sort(), [...DIRECTOR_FIELDS].sort())
  for (const f of ADMIN_FIELDS) assert.ok(!(f in body.config), f)
})

test("an Admin's save sends everything", () => {
  assert.deepEqual(savePayload(DEFAULT_CONFIG, 'admin').config, DEFAULT_CONFIG)
})

test('a rule switched off is part of the Director save', () => {
  const rules = DEFAULT_CONFIG.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r))
  const sent = savePayload({ ...DEFAULT_CONFIG, rules }, 'director').config.rules!
  assert.equal(sent[0].enabled, false)
})

test('the Advanced section is shown to Admins only', () => {
  assert.equal(showsAdvanced('admin'), true)
  assert.equal(showsAdvanced('director'), false)
  assert.equal(showsAdvanced(null), false)
})

test('the field lists do not overlap', () => {
  assert.ok(directorMayChange('rules') && directorMayChange('defaultFillers'))
  assert.ok(!directorMayChange('timezone') && adminOnlyField('timezone') && adminOnlyField('weightOverrides'))
})

test('a Director config with missing fields is filled with defaults for the preview', () => {
  const c = fullConfig({ rules: [], defaultFillers: ['A'], enabled: true })
  assert.equal(c.timezone, DEFAULT_CONFIG.timezone)
  assert.deepEqual(c.defaultFillers, ['A'])
})

test('a refused save shows the sentence from the server, or a plain fallback', () => {
  assert.equal(plainSaveError(new Error('Only admins can change: timezone.')), 'Only admins can change: timezone.')
  assert.equal(plainSaveError('x'), 'Could not save. Try again.')
})
