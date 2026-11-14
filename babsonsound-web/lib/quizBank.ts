// The training quiz question bank, edited on Settings > Training quiz (/admin/quiz). Pure rules shared by the page, the API and the tests:
// checking a question, reading a batch import (CSV or JSON), CSV export, and making sure the bank can still fill a quiz.
import type { QuizQuestion, QuizTopic } from './training.ts'
import { QUIZ_MIX, SELF_QUESTIONS } from './selfTraining.ts'

export const TOPICS: QuizTopic[] = ['slurs', 'privacy', 'technical', 'rules']
export const TOPIC_LABEL: Record<QuizTopic, string> = {
  slurs: 'Slurs',
  privacy: 'Private information',
  technical: 'Equipment and troubleshooting',
  rules: 'Station rules (not in the quiz now)',
}
/** How many of each topic one quiz takes (the rest of SELF_QUESTIONS are technical). */
export const QUIZ_NEEDS: Record<'slurs' | 'privacy' | 'technical', number> = { ...QUIZ_MIX, technical: SELF_QUESTIONS - QUIZ_MIX.slurs - QUIZ_MIX.privacy }
export const MAX_QUESTIONS = 500
export const LIMITS = { q: 300, option: 200, why: 500, minOptions: 2, maxOptions: 6 }
const LETTERS = 'ABCDEF'

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** A short id from the question text, made unique against `taken`. */
export function makeId(q: string, taken: Set<string>): string {
  const base = clean(q).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-') || 'question'
  let id = base, n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

/** The right answer as an index: a number (0-based) or a letter (A to F). */
function answerIndex(v: unknown, count: number): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v >= 0 && v < count ? v : null
  const s = clean(v).toUpperCase()
  if (/^[A-F]$/.test(s)) { const i = LETTERS.indexOf(s); return i < count ? i : null }
  if (/^\d+$/.test(s)) { const i = Number(s); return i < count ? i : null }
  return null
}

export type Checked = { ok: true; question: QuizQuestion } | { ok: false; error: string }

/** Checks one question. A missing id gets one from the text; `taken` is the ids already in use (not counting this question's own). */
export function checkQuestion(input: unknown, taken: Set<string>): Checked {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const topic = clean(r.topic).toLowerCase() as QuizTopic
  if (!TOPICS.includes(topic)) return { ok: false, error: `Pick a topic: ${TOPICS.join(', ')}.` }
  const q = clean(r.q ?? r.question)
  if (q.length < 5) return { ok: false, error: 'Write the question.' }
  if (q.length > LIMITS.q) return { ok: false, error: `Keep the question under ${LIMITS.q} characters.` }
  const options = (Array.isArray(r.options) ? r.options : []).map(clean).filter(Boolean)
  if (options.length < LIMITS.minOptions) return { ok: false, error: 'Give at least 2 answers.' }
  if (options.length > LIMITS.maxOptions) return { ok: false, error: `At most ${LIMITS.maxOptions} answers.` }
  if (options.some(o => o.length > LIMITS.option)) return { ok: false, error: `Keep each answer under ${LIMITS.option} characters.` }
  if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return { ok: false, error: 'Two answers are the same.' }
  const answer = answerIndex(r.answer, options.length)
  if (answer == null) return { ok: false, error: 'Say which answer is right (A, B, C...).' }
  const why = clean(r.why)
  if (!why) return { ok: false, error: 'Explain why (people who get it wrong see this, never the right answer).' }
  if (why.length > LIMITS.why) return { ok: false, error: `Keep the explanation under ${LIMITS.why} characters.` }
  let id = clean(r.id).toLowerCase()
  if (id && (!/^[a-z0-9-]{1,60}$/.test(id))) return { ok: false, error: 'Ids use lowercase letters, numbers and dashes.' }
  if (!id || taken.has(id)) id = makeId(q, taken)
  return { ok: true, question: { id, topic, q, options, answer, why } }
}

/** '' when the bank can fill a quiz, otherwise a sentence saying what is missing. */
export function mixProblem(pool: { topic: string }[]): string {
  const short = (Object.entries(QUIZ_NEEDS) as [QuizTopic, number][])
    .map(([t, n]) => ({ t, n, have: pool.filter(q => q.topic === t).length }))
    .filter(x => x.have < x.n)
  if (!short.length) return ''
  return `Each quiz needs ${QUIZ_NEEDS.slurs} slurs, ${QUIZ_NEEDS.privacy} private information and ${QUIZ_NEEDS.technical} equipment questions. ` +
    `This would leave ${short.map(x => `${x.have} ${TOPIC_LABEL[x.t].toLowerCase()}`).join(' and ')}.`
}

/** Splits CSV text into rows (quotes, doubled quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

export const CSV_HEADER = ['topic', 'question', 'a', 'b', 'c', 'd', 'e', 'f', 'answer', 'why']

/**
 * A batch import: a JSON array of { topic, q (or question), options, answer, why }, or CSV with a header row
 * topic,question,a,b,c,d[,e,f],answer,why (answer is the letter of the right one). Returns the rows as raw objects, and
 * any rows that could not be read. Checking each question is checkQuestion's job.
 */
export function readImport(text: string): { rows: Record<string, unknown>[]; errors: string[] } {
  const t = text.trim()
  if (!t) return { rows: [], errors: ['Paste questions or pick a file first.'] }
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const v = JSON.parse(t)
      const list = Array.isArray(v) ? v : Array.isArray(v?.questions) ? v.questions : null
      if (!list) return { rows: [], errors: ['The JSON should be a list of questions.'] }
      return { rows: list.filter((x: unknown) => x && typeof x === 'object'), errors: [] }
    } catch { return { rows: [], errors: ['That JSON could not be read. Check the commas and quotes.'] } }
  }
  const all = parseCsv(t)
  const head = (all[0] ?? []).map(h => h.trim().toLowerCase())
  const col = (name: string) => head.indexOf(name)
  if (col('topic') < 0 || col('question') < 0 || col('answer') < 0) return { rows: [], errors: [`The first CSV row must be the column names: ${CSV_HEADER.join(',')}`] }
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'].filter(l => col(l) >= 0)
  return {
    rows: all.slice(1).map(cells => ({
      topic: cells[col('topic')], q: cells[col('question')], answer: cells[col('answer')], why: col('why') >= 0 ? cells[col('why')] : '',
      ...(col('id') >= 0 ? { id: cells[col('id')] } : {}),
      options: letters.map(l => cells[col(l)] ?? '').filter(o => o.trim()),
    })),
    errors: [],
  }
}

/**
 * Adds a batch to the bank: every row is checked, a row whose question text is already in the bank is skipped.
 * Returns the questions to add and, per row (1 = the first question), what was wrong. Nothing is added if any row is wrong.
 */
export function planImport(bank: QuizQuestion[], rows: Record<string, unknown>[]): { add: QuizQuestion[]; skipped: number; errors: string[] } {
  const taken = new Set(bank.map(q => q.id))
  const seen = new Set(bank.map(q => q.q.toLowerCase()))
  const add: QuizQuestion[] = [], errors: string[] = []
  let skipped = 0
  rows.forEach((row, i) => {
    const c = checkQuestion(row, taken)
    if (!c.ok) { errors.push(`Question ${i + 1}: ${c.error}`); return }
    if (seen.has(c.question.q.toLowerCase())) { skipped++; return }
    seen.add(c.question.q.toLowerCase()); taken.add(c.question.id); add.push(c.question)
  })
  if (bank.length + add.length > MAX_QUESTIONS) errors.push(`The bank holds at most ${MAX_QUESTIONS} questions.`)
  return { add, skipped, errors }
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** The whole bank as CSV, in the same layout the import reads (so it can be edited in a spreadsheet and imported again). */
export function toCsv(bank: QuizQuestion[]): string {
  const lines = [['id', ...CSV_HEADER].join(',')]
  for (const q of bank) {
    const opts = LETTERS.split('').map((_, i) => q.options[i] ?? '')
    lines.push([q.id, q.topic, q.q, ...opts, LETTERS[q.answer], q.why].map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

export const answerLetter = (i: number) => LETTERS[i] ?? '?'
