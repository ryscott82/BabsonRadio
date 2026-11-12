import test from 'node:test'
import assert from 'node:assert/strict'
import { autoHelp, autoLine, autoState, holdBody, holdLabel } from './slotWording.ts'

const NOW = 1_000_000_000_000
const fmt = (ms: number) => `T${ms - NOW}`

test('a request with an approval time says when it approves itself', () => {
  assert.equal(autoLine({ autoApproveAt: NOW + 5000 }, NOW, fmt), 'Approves automatically on T5000')
  assert.equal(autoState({ autoApproveAt: NOW + 5000 }, NOW), 'scheduled')
})

test('a time that has passed but is not blocked says soon', () => {
  assert.equal(autoLine({ autoApproveAt: NOW - 1 }, NOW, fmt), 'Approves automatically soon')
})

test('the week limit reads exactly: Waiting for staff (week limit)', () => {
  assert.equal(autoLine({ autoBlockedReason: 'week-limit', autoApproveAt: NOW - 5 }, NOW, fmt), 'Waiting for staff (week limit)')
})

test('a hold wins over everything and reads Held', () => {
  assert.equal(autoLine({ held: true, autoApproveAt: NOW + 9, autoBlockedReason: 'week-limit' }, NOW, fmt), 'Held')
})

test('other blocks and ineligible people wait for staff, with the reason when there is one', () => {
  assert.equal(autoLine({ autoBlockedReason: 'training' }, NOW, fmt), 'Waiting for staff (radio training needed)')
  assert.equal(autoLine({ autoEligible: false }, NOW, fmt), 'Waiting for staff')
  assert.equal(autoLine({}, NOW, fmt), 'Waiting for staff')
})

test('help text differs for staff and the student', () => {
  assert.match(autoHelp({ held: true }, NOW, 'staff'), /release the hold/)
  assert.match(autoHelp({ held: true }, NOW, 'student'), /Staff are keeping/)
  assert.match(autoHelp({ autoBlockedReason: 'week-limit' }, NOW, 'student'), /this week/)
})

test('Hold and Release hold send the existing hold endpoint body', () => {
  assert.deepEqual(holdBody('abc', true), { requestId: 'abc', hold: true, note: '' })
  assert.deepEqual(holdBody('abc', false), { requestId: 'abc', hold: false, note: '' })
  assert.equal(holdLabel(false), 'Hold'); assert.equal(holdLabel(true), 'Release hold')
})
