// Run with:  npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanInstagram, instagramUrl } from './instagram.ts'

test('plain handles and @handles', () => {
  assert.equal(cleanInstagram('ryan.scott_1'), 'ryan.scott_1')
  assert.equal(cleanInstagram('  @Babson.Radio  '), 'babson.radio')
})

test('pasted links', () => {
  assert.equal(cleanInstagram('https://www.instagram.com/babsonradio/'), 'babsonradio')
  assert.equal(cleanInstagram('instagram.com/BabsonRadio?igsh=abc123'), 'babsonradio')
  assert.equal(cleanInstagram('http://m.instagram.com/babson_radio/#x'), 'babson_radio')
  assert.equal(cleanInstagram('https://instagr.am/babsonradio'), 'babsonradio')
})

test('things that are not a handle', () => {
  for (const bad of ['', '   ', '@', 'two words', 'a'.repeat(31), 'bad.', 'a..b', 'name!', 'https://example.com/name', 'https://www.instagram.com/p/Cabc123/', 'https://www.instagram.com/', 'instagram.com/explore/', 'reels', null, 12])
    assert.equal(cleanInstagram(bad as string), null, String(bad))
})

test('profile url', () => {
  assert.equal(instagramUrl('babson.radio'), 'https://www.instagram.com/babson.radio/')
})
