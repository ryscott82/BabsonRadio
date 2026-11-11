import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTarget, cleanType, minMessage, pushTitle } from './feedbackInput.ts'

test('type: only feature and report are kept, everything else is a bug (older apps send bug or feature)', () => {
  assert.equal(cleanType('feature'), 'feature')
  assert.equal(cleanType('report'), 'report')
  assert.equal(cleanType('bug'), 'bug')
  assert.equal(cleanType('<script>'), 'bug')
  assert.equal(cleanType(undefined), 'bug')
})

test('target: kind must be one of the known kinds, text is trimmed and capped, junk becomes an empty "other"', () => {
  assert.deepEqual(cleanTarget({ kind: 'person', id: ' abc ', label: ' Sam ' }), { kind: 'person', id: 'abc', label: 'Sam' })
  assert.deepEqual(cleanTarget({ kind: 'admin', id: 5 }), { kind: 'other', id: '', label: '' })
  assert.deepEqual(cleanTarget(null), { kind: 'other', id: '', label: '' })
  assert.deepEqual(cleanTarget('x'), { kind: 'other', id: '', label: '' })
  assert.equal(cleanTarget({ kind: 'content', label: 'x'.repeat(500) }).label.length, 200)
})

test('a report may be short, a bug or idea needs a little more', () => {
  assert.equal(minMessage('report'), 3)
  assert.equal(minMessage('bug'), 5)
  assert.equal(minMessage('feature'), 5)
})

test('push titles say what came in', () => {
  assert.equal(pushTitle('bug'), 'New bug report')
  assert.equal(pushTitle('feature'), 'New feature idea')
  assert.equal(pushTitle('report', { kind: 'person', id: '', label: '' }), 'New report about a person')
  assert.equal(pushTitle('report', { kind: 'content', id: '', label: '' }), 'New content report')
  assert.equal(pushTitle('report'), 'New content report')
})
