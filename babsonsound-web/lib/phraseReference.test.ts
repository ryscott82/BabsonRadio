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

test('wherever the agreement and the explicit quiz questions talk about explicit words, they point to the reference', async () => {
  const { ON_AIR_CLAUSES } = await import('./conduct.ts')
  assert.match(ON_AIR_CLAUSES[0], /explicit songs[\s\S]*slurs[\s\S]*babsonradio\.com\/words/)
  const { QUIZ } = await import('./training.ts')
  for (const id of ['clean-hours', 'explicit-def', 'slur-song', 'unsure']) assert.match(QUIZ.find(q => q.id === id)!.why, /Explicit phrase reference/, id)
})

test('Resources on the Members page: the reference first, then every guide, and every guide has its file', async () => {
  const { GUIDES, TOOLS } = await import('./memberResources.ts')
  assert.equal(TOOLS[0].href, '/words'); assert.equal(TOOLS[0].trained, true)
  for (const g of GUIDES) {
    const md = readFileSync(new URL(`../content/guides/${g.slug}.md`, import.meta.url), 'utf8')
    assert.match(md, /^# /, g.slug)
    assert.match(g.slug, /^[a-z0-9-]+$/)
  }
  assert.match(src('app/members/page.tsx'), /<Section id="resources" title="Resources"><ResourcesCard/)
})
