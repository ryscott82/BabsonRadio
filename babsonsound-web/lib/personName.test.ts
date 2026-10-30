// Run with:  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { lastNameFromEmail, splitName } from './personName.ts'

test('last name comes from a Babson email: first initial, last name, optional number', () => {
  assert.equal(lastNameFromEmail('rscott1@babson.edu'), 'Scott')
  assert.equal(lastNameFromEmail('RSCOTT@Babson.edu'), 'Scott')
  assert.equal(lastNameFromEmail(' jsmith22@babson.edu '), 'Smith')
})

test('Olin works the same way, with or without a number', () => {
  assert.equal(lastNameFromEmail('rscott@olin.edu'), 'Scott')
  assert.equal(lastNameFromEmail('RScott2@Olin.edu'), 'Scott')
})

test('Wellesley gives only the last initial', () => {
  assert.equal(lastNameFromEmail('fl103@wellesley.edu'), 'L')
  assert.equal(lastNameFromEmail('FL7@wellesley.edu'), 'L')
  for (const e of ['fl@wellesley.edu', 'flee103@wellesley.edu', 'f103@wellesley.edu']) assert.equal(lastNameFromEmail(e), null, e)
})

test('other addresses give no last name', () => {
  for (const e of ['', 'ryan@gmail.com', 'rscott@mail.babson.edu', 'r.scott@babson.edu', 'a1@babson.edu', 'rs@babson.edu', '1scott@babson.edu'])
    assert.equal(lastNameFromEmail(e), null, e)
})

test('one word on a Babson email gets the last name added; more words are kept as typed', () => {
  assert.deepEqual(splitName('Ryan', 'rscott1@babson.edu'), { firstName: 'Ryan', lastName: 'Scott' })
  assert.deepEqual(splitName('  Ryan   Scott ', 'rscott1@babson.edu'), { firstName: 'Ryan', lastName: 'Scott' })
  assert.deepEqual(splitName('Mary Ann Lee', 'mlee@babson.edu'), { firstName: 'Mary', lastName: 'Ann Lee' })
  assert.deepEqual(splitName('Fran', 'fl103@wellesley.edu'), { firstName: 'Fran', lastName: 'L' })
  assert.deepEqual(splitName('Fran Lee', 'fl103@wellesley.edu'), { firstName: 'Fran', lastName: 'Lee' })
  assert.deepEqual(splitName('Ryan', 'ryan@gmail.com'), { firstName: 'Ryan', lastName: '' })
  assert.deepEqual(splitName('   ', 'rscott1@babson.edu'), { firstName: '', lastName: '' })
})
