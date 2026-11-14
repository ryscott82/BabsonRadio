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

test('signed-in trained members only, limited per person, and only the worst kind comes back, never the word or the list', () => {
  const route = src('app/api/words/check/route.ts')
  assert.match(route, /const t = await requireStudent\(req\)/)
  assert.match(route, /if \(!a\.studio && !a\.radio\) throw new HttpError\(403/)
  assert.match(route, /allow\(t\.uid/)
  assert.match(route, /return \{ tier \}/)
  assert.doesNotMatch(src('components/GuestFence.tsx'), /'\/words'/)
  const page = src('app/words/page.tsx')
  assert.match(page, /if \(!user\) return/)
  assert.match(page, /if \(!studioTrained && !radioTrained\) return/)
})

test('the booth button is only for someone signed in (not the idle screen or the no-sign-in bypass)', () => {
  assert.doesNotMatch(src('components/booth/IdleScreen.tsx'), /Phrase reference/)
  assert.match(src('app/booth/page.tsx'), /\{!bypass && <button type="button" className=\{sb\} onClick=\{\(\) => setPhrases\(true\)\}>Phrase reference<\/button>\}/)
})
