// Run with:  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { isTestEmail } from './testAccount.ts'

test('+test aliases are test accounts', () => {
  for (const e of ['rydj007+test1@gmail.com', 'a+test@babson.edu', 'A+TEST22@Gmail.com', ' x+test-a@y.co ']) assert.equal(isTestEmail(e), true, e)
})

test('real addresses are not', () => {
  for (const e of ['test1@gmail.com', 'rydj007@gmail.com', 'rydj007+testing@gmail.com'.replace('testing', 'x'), 'a+tes@gmail.com', '+test1@gmail.com', 'test+a@gmail.com'])
    assert.equal(isTestEmail(e), false, e)
})
