import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { QUIZ } from './training.ts'
import { checkQuestion, makeId, mixProblem, parseCsv, planImport, readImport, toCsv } from './quizBank.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const good = { topic: 'studio', q: 'What do you do when the meter is red?', options: ['Nothing', 'Turn the mixer down'], answer: 'B', why: 'Red means clipping.' }

test('a question needs a topic, text, 2 to 6 different answers, the right one and a why', () => {
  const c = checkQuestion(good, new Set())
  assert.ok(c.ok)
  if (c.ok) { assert.equal(c.question.answer, 1); assert.equal(c.question.id, 'what-do-you-do-when') }
  assert.match((checkQuestion({ ...good, topic: 'music' }, new Set()) as { error: string }).error, /topic/)
  assert.match((checkQuestion({ ...good, options: ['Only one'] }, new Set()) as { error: string }).error, /at least 2/)
  assert.match((checkQuestion({ ...good, options: ['Same', 'same'] }, new Set()) as { error: string }).error, /same/)
  assert.match((checkQuestion({ ...good, answer: 'C' }, new Set()) as { error: string }).error, /which answer/)
  assert.match((checkQuestion({ ...good, why: ' ' }, new Set()) as { error: string }).error, /why/i)
  assert.equal((checkQuestion({ ...good, answer: 0 }, new Set()) as { question: { answer: number } }).question.answer, 0)
})

test('a bank saved before the radio/studio split still works: technical becomes radio or studio', async () => {
  const { currentTopic } = await import('./quizBank.ts')
  assert.equal(currentTopic('technical', 'tech-go-live'), 'radio')
  assert.equal(currentTopic('technical', 'tech-no-sound'), 'studio')
  assert.equal(currentTopic('technical', 'my-own-question'), 'studio')
  assert.equal(currentTopic('slurs', 'x'), 'slurs')
  const c = checkQuestion({ ...good, topic: 'technical' }, new Set())
  assert.ok(c.ok && c.question.topic === 'studio')
  assert.match(src('lib/server/quizBank.ts'), /topic: currentTopic\(q\.topic, q\.id\)/)
})

test('ids are made from the text and never clash', () => {
  assert.equal(makeId('Hello there, world!', new Set()), 'hello-there-world')
  assert.equal(makeId('Hello there, world!', new Set(['hello-there-world'])), 'hello-there-world-2')
})

test('the bank must still fill a quiz: 1 slurs, 1 private information, 8 equipment', () => {
  assert.equal(mixProblem(QUIZ), '')
  assert.match(mixProblem(QUIZ.filter(q => q.topic !== 'privacy')), /0 radio: private information/)
  assert.match(mixProblem(QUIZ.filter(q => q.topic !== 'studio').concat(QUIZ.filter(q => q.topic === 'studio').slice(0, 6))), /6 studio and equipment/)
  assert.match(mixProblem(QUIZ.filter(q => q.topic !== 'radio')), /0 radio: going on air/)
})

test('CSV import: quotes, commas and line breaks inside cells, answer letters, optional e and f', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n'), [['a', 'b, c', 'say "hi"'], ['1', 'two\nlines', '3']])
  const r = readImport('topic,question,a,b,c,d,answer,why\ntechnical,"Meter says ""No sound"". First?",Restart the PC,Check your fader,Shout,Nothing,B,"No sound means the PC hears nothing."\n')
  assert.deepEqual(r.errors, [])
  assert.equal(r.rows.length, 1)
  const plan = planImport([], r.rows)
  assert.deepEqual(plan.errors, [])
  assert.equal(plan.add[0].q, 'Meter says "No sound". First?')
  assert.deepEqual(plan.add[0].options, ['Restart the PC', 'Check your fader', 'Shout', 'Nothing'])
  assert.equal(plan.add[0].answer, 1)
  assert.match(readImport('question,answer\nx,A').errors[0], /column names/)
})

test('JSON import, and duplicates are skipped while any bad row stops the whole batch', () => {
  const rows = readImport(JSON.stringify([good, { ...good, q: 'A second question here?' }])).rows
  assert.equal(planImport([], rows).add.length, 2)
  const bank = planImport([], rows).add
  const again = planImport(bank, rows)
  assert.equal(again.add.length, 0); assert.equal(again.skipped, 2)
  const bad = planImport([], [good, { ...good, q: 'Another one?', answer: 'Z' }])
  assert.equal(bad.errors.length, 1); assert.match(bad.errors[0], /^Question 2:/)
  assert.match(readImport('[oops').errors[0], /JSON/)
})

test('export and import again gives the same questions', () => {
  const csv = toCsv(QUIZ)
  const plan = planImport([], readImport(csv).rows)
  assert.deepEqual(plan.errors, [])
  assert.deepEqual(plan.add.map(q => [q.id, q.topic, q.q, q.options, q.answer, q.why]), QUIZ.map(q => [q.id, q.topic, q.q, q.options, q.answer, q.why]))
})

test('only Admins can delete in bulk or undo; everyone on the page is E-board or Admin', () => {
  const route = src('app/api/admin/quiz/route.ts')
  assert.match(route, /await requireDirector\(req\)/)
  assert.match(route, /action === 'deleteMany' \|\| action === 'undo'\) \{\n\s+if \(!admin\) throw new HttpError\(403/)
  const page = src('app/admin/quiz/page.tsx')
  assert.match(page, /\{isAdmin && shown\.length > 0 &&/)
  assert.match(page, /\{isAdmin && bank\?\.canUndo &&/)
})

test('the quiz uses the stored bank and grades the questions that were shown', () => {
  const route = src('app/api/studio/self-training/route.ts')
  assert.match(route, /loadQuizBank\(adminDb\(\)\)/)
  assert.match(route, /drawnIds: drawn\.map\(q => q\.id\), drawnAttempt: attempts/)
  assert.match(route, /The quiz questions were just changed/)
  assert.match(src('lib/server/quizBank.ts'), /const problem = mixProblem\(next\)\n\s+if \(problem\) throw/)
})

test('training order: video, then the agreement, then the quiz; passing grants the badges and the agreement counts as the on-air one', () => {
  const route = src('app/api/studio/self-training/route.ts')
  assert.ok(route.indexOf('if (b.agreement)') < route.indexOf('Step 2: the quiz'))
  assert.match(route, /if \(!signedNow\(snap\)\) throw new HttpError\(403, 'Read and sign the agreement first/)
  assert.match(route, /conductVersion: sig\.version/)
  assert.match(route, /if \(graded\.passed\) \{\n\s+const granted = await writeGrants/)
  const page = src('app/training/page.tsx')
  assert.match(page, /type Step = 'video' \| 'sign' \| 'quiz' \| 'form'/)
})

test('the agreement is two parts: eleven lines to tick, 8 for the Radio Room and 3 for the Radio Agreement, every topic still covered', async () => {
  const { HOST_AGREEMENTS, STUDIO_CLAUSES, ON_AIR_CLAUSES } = await import('./conduct.ts')
  const lines = HOST_AGREEMENTS.flatMap(a => a.clauses)
  assert.equal(lines.length, 11)
  assert.deepEqual(HOST_AGREEMENTS.map(a => a.title), ['Radio Room', 'Radio Agreement'])
  assert.equal(STUDIO_CLAUSES.length, 8); assert.equal(ON_AIR_CLAUSES.length, 3)
  const all = HOST_AGREEMENTS.map(a => [a.intro ?? '', ...a.clauses].join(' ')).join(' ')
  for (const must of [/untrained member/, /QR code or my Babson Sound Account/, /WhatsApp/, /quiet hours/, /sign out of the booth/, /recorded/, /18 or older/, /Terms of Use/, /Privacy Policy/,
    /nondiscrimination/, /report to Babson/, /explicit songs from 6AM to 8PM/, /slurs/, /babsonradio\.com\/words/, /private information/, /responsible for everything on air/, /set list/, /rights holders/]) assert.match(all, must)
})
