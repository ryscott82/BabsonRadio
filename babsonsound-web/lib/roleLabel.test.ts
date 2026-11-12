import test from 'node:test'
import assert from 'node:assert/strict'
import { roleLabel } from './roleLabel.ts'
import { readFileSync } from 'node:fs'

test('the stored value director is shown as E-board, the others as they are', () => {
  assert.equal(roleLabel('director'), 'E-board')
  assert.equal(roleLabel('admin'), 'Admin'); assert.equal(roleLabel('student'), 'Student'); assert.equal(roleLabel('guest'), 'Guest')
})

test('the Users page and the Today header use the shared helper, not their own words', () => {
  const users = readFileSync(new URL('../app/admin/users/page.tsx', import.meta.url), 'utf8')
  const today = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
  assert.match(users, /roleLabel\('director'\)/)
  assert.match(today, /roleLabel\('director'\)/)
  assert.doesNotMatch(users, /director: 'Director'/)
})
