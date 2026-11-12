import test from 'node:test'
import assert from 'node:assert/strict'
import { adminBody, canEditList, directorBody, newWordCount, parseWords } from './blockedWordsPage.ts'

test('words are split on lines and commas, lowercased and de-duplicated', () => {
  assert.deepEqual(parseWords(' Foo, bar\nFOO\n\n baz '), ['foo', 'bar', 'baz'])
})

test("a Director's save keeps every saved word, adds the new ones, and sends no level", () => {
  const b = directorBody(['one', 'two'], 'Three, two')
  assert.deepEqual(b, { words: ['one', 'two', 'three'] })
  assert.ok(!('level' in b))
})

test("an Admin's save sends the list as edited and the level", () => {
  assert.deepEqual(adminBody('a\nb', 'crude'), { words: ['a', 'b'], level: 'crude' })
})

test('only an Admin edits the list (no remove buttons or strictness for a Director)', () => {
  assert.equal(canEditList(true), true)
  assert.equal(canEditList(false), false)
})

test('counts only new words', () => {
  assert.equal(newWordCount(['one'], 'one, two, three'), 2)
})
