import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { phraseVerdict } from './phraseReference.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('each result says what it means for going on air', () => {
  assert.equal(phraseVerdict('banned').tone, 'no'); assert.match(phraseVerdict('banned').title, /Slur/)
  assert.match(phraseVerdict('explicit').text, /6 AM to 10 PM Eastern/)
  assert.match(phraseVerdict('crude').text, /6 AM to 10 PM Eastern/)
  assert.match(phraseVerdict('clean').text, /does not make it fine/)
})

test('anyone can check (no sign-in, rate limited per IP), and only the worst kind comes back, never the word or the list', () => {
  const route = src('app/api/words/check/route.ts')
  assert.doesNotMatch(route, /require(User|Student|Member|Director|Admin)/)
  assert.match(route, /clientIp\(req\.headers\)/)
  assert.match(route, /return \{ tier \}/)
  assert.match(src('components/GuestFence.tsx'), /'\/words'\]/)
})

test('the booth has the button signed out and signed in, and the training links to the page', () => {
  assert.match(src('components/booth/IdleScreen.tsx'), /onClick=\{\(\) => setPhrases\(true\)\}>Phrase reference</)
  assert.match(src('app/booth/page.tsx'), /onClick=\{\(\) => setPhrases\(true\)\}>Phrase reference</)
  assert.match(src('app/training/page.tsx'), /href="\/words"/)
  assert.match(src('app/words/page.tsx'), /Explicit phrase reference/)
})
