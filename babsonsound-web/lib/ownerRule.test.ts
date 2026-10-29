import test from 'node:test'
import assert from 'node:assert/strict'
import { isListedOwner, isVerifiedOwner } from './ownerRule.ts'

const owners = ['boss@babson.edu', 'me@gmail.com']

test('an owner address is only an owner once its email is verified', () => {
  assert.equal(isVerifiedOwner('boss@babson.edu', true, owners), true)
  assert.equal(isVerifiedOwner('boss@babson.edu', false, owners), false)
  assert.equal(isVerifiedOwner('boss@babson.edu', undefined, owners), false)
  assert.equal(isVerifiedOwner('boss@babson.edu', 'true', owners), false) // must be the real boolean
})

test('matching ignores case and spaces, and other emails are never owners', () => {
  assert.equal(isVerifiedOwner(' Boss@Babson.edu ', true, owners), true)
  assert.equal(isVerifiedOwner('someone@babson.edu', true, owners), false)
  assert.equal(isVerifiedOwner('', true, owners), false)
  assert.equal(isVerifiedOwner(null, true, owners), false)
  assert.equal(isVerifiedOwner('boss@babson.edu', true, []), false)
})

test('the Apple school-email step can tell an owner address even when unverified', () => {
  assert.equal(isListedOwner('BOSS@babson.edu', owners), true)
  assert.equal(isListedOwner('x@babson.edu', owners), false)
  assert.equal(isListedOwner(undefined, owners), false)
})
