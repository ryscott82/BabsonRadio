import test from 'node:test'
import assert from 'node:assert/strict'
import { isBlockedNumber, normalizeUS } from './phone.ts'

test('normalizeUS gives E.164 and rejects bad numbers', () => {
  assert.equal(normalizeUS('(617) 555-0123'), '+16175550123')
  assert.equal(normalizeUS('+1 617 555 0123'), '+16175550123')
  for (const bad of ['123', '', '(017) 555-0123', '(117) 555-0123', '61755501234']) assert.equal(normalizeUS(bad), null, bad)
})

test("Babson's own lines (781-239) are blocked, however they are typed", () => {
  for (const n of ['+17812391234', '(781) 239-1234', '1-781-239-0000', '7812390000']) assert.equal(isBlockedNumber(n), true, n)
  for (const n of ['+16175550123', '(781) 240-1234', '(781) 238-9999']) assert.equal(isBlockedNumber(n), false, n)
})
