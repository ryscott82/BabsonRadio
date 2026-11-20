'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { QuizQuestion, QuizTopic } from '@/lib/training'
import { CSV_HEADER, LIMITS, QUIZ_NEEDS, TOPICS, TOPIC_LABEL, answerLetter, checkQuestion, planImport, readImport, toCsv } from '@/lib/quizBank'

// Settings > Training quiz. The question bank the training at /training draws from (1 slurs, 1 private information, 8 equipment).
// E-board and Admins add, edit, import and delete one at a time. Only Admins can tick several and delete them together, or undo.

interface Bank { questions: QuizQuestion[]; builtIn: boolean; updatedAt: number | null; updatedBy: string; lastAction: string; canUndo: boolean; problem: string; note?: string }
type Draft = { id?: string; topic: QuizTopic; q: string; options: string[]; answer: number; why: string }
const empty = (topic: QuizTopic = 'studio'): Draft => ({ topic, q: '', options: ['', '', '', ''], answer: 0, why: '' })
const field = 'ops-field w-full min-h-11'
const small = 'ops-btn px-4 min-h-11 disabled:opacity-50'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function QuizBankPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [bank, setBank] = useState<Bank | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [topic, setTopic] = useState<QuizTopic | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [confirmId, setConfirmId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirmMany, setConfirmMany] = useState(false)
  const [importText, setImportText] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace('/') }, [loading, user, isDirector, router])
  useEffect(() => {
    if (!user || !isDirector) return
    apiGet<Bank>('/api/admin/quiz').then(setBank).catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isDirector])

  async function send(body: Record<string, unknown>, tag: string) {
    setBusy(tag); setError(''); setNotice('')
    try {
      const r = await api<Bank>('/api/admin/quiz', body)
      setBank(r); setNotice(r.note ?? 'Saved.')
      setPicked(new Set()); setConfirmMany(false); setConfirmId('')
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); return false }
    finally { setBusy('') }
  }

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase()
    return (bank?.questions ?? []).filter(q => (topic === 'all' || q.topic === topic) &&
      (!t || q.q.toLowerCase().includes(t) || q.options.some(o => o.toLowerCase().includes(t)) || q.id.includes(t)))
  }, [bank, topic, search])
  const count = (t: QuizTopic) => bank?.questions.filter(q => q.topic === t).length ?? 0

  const preview = useMemo(() => {
    if (!importText.trim() || !bank) return null
    const read = readImport(importText)
    if (read.errors.length) return { add: 0, skipped: 0, errors: read.errors, rows: [] as Record<string, unknown>[] }
    const plan = planImport(bank.questions, read.rows)
    return { add: plan.add.length, skipped: plan.skipped, errors: plan.errors, rows: read.rows }
  }, [importText, bank])

  async function pickFile(f: File | undefined) {
    if (!f) return
    if (f.size > 1_000_000) { setError('That file is too big (1 MB at most).'); return }
    setImportText(await f.text())
  }

  if (loading || !isDirector) return null
  const draftCheck = editing ? checkQuestion({ ...editing, options: editing.options }, new Set()) : null

  return (
    <div className="px-5 lg:px-8 py-8 space-y-6 max-w-4xl">
      <h1 className="text-4xl font-light leading-tight">Training quiz</h1>
      <p className="text-base text-white">
        The questions for the training at babsonradio.com/training. Each quiz is mostly the studio: {QUIZ_NEEDS.studio} studio and equipment
        questions, plus 3 radio ones ({QUIZ_NEEDS.radio} on going on air, {QUIZ_NEEDS.slurs} on slurs, {QUIZ_NEEDS.privacy} on private information), picked at random. Every answer has to be right. People who get one wrong
        see the explanation, never the right answer. Changes reach the quiz within a minute.
      </p>

      {bank && (
        <div className="ops-card p-4 space-y-1">
          <p className="text-base text-white">
            {bank.questions.length} questions: {TOPICS.map(t => `${count(t)} ${TOPIC_LABEL[t].toLowerCase()}`).join(', ')}.
          </p>
          {bank.problem ? <p className="text-base bg-white text-[#9d1c14] px-3 py-1 font-semibold">{bank.problem}</p> : <p className="text-base text-white">Enough of each to fill a quiz.</p>}
          <p className="text-base text-white">
            {bank.builtIn ? 'These are the built-in questions. The first change saves them as the bank.' : `Last change: ${bank.lastAction || 'saved'}${bank.updatedBy ? ` by ${bank.updatedBy}` : ''}${bank.updatedAt ? `, ${new Date(bank.updatedAt).toLocaleString()}` : ''}.`}
          </p>
        </div>
      )}

      <div className="whitespace-pre-line">{error && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{error}</p>}</div>
      {notice && <p role="status" className="text-base text-white font-semibold">{notice}</p>}

      {/* Add or edit one question */}
      {editing ? (
        <section className="ops-card p-4 space-y-3" aria-label={editing.id ? 'Edit question' : 'New question'}>
          <h2 className="text-white text-lg">{editing.id ? 'Edit question' : 'New question'}</h2>
          <label className="block space-y-1"><span className="text-base text-white">Topic</span>
            <select value={editing.topic} onChange={e => setEditing({ ...editing, topic: e.target.value as QuizTopic })} className={field}>
              {TOPICS.map(t => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-base text-white">Question</span>
            <textarea value={editing.q} maxLength={LIMITS.q} rows={2} onChange={e => setEditing({ ...editing, q: e.target.value })} className={field} />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-base text-white">Answers (pick the right one)</legend>
            {editing.options.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                <input type="radio" name="right" aria-label={`Answer ${answerLetter(i)} is right`} checked={editing.answer === i} onChange={() => setEditing({ ...editing, answer: i })} />
                <span className="text-base text-white w-5">{answerLetter(i)}</span>
                <input value={o} maxLength={LIMITS.option} onChange={e => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })} className={field} />
                {editing.options.length > LIMITS.minOptions && (
                  <button type="button" aria-label={`Remove answer ${answerLetter(i)}`} className="text-white text-xl px-2"
                    onClick={() => setEditing({ ...editing, options: editing.options.filter((_, j) => j !== i), answer: editing.answer === i ? 0 : editing.answer > i ? editing.answer - 1 : editing.answer })}>×</button>
                )}
              </div>
            ))}
            {editing.options.length < LIMITS.maxOptions && <button type="button" className="text-base text-white font-semibold underline underline-offset-2" onClick={() => setEditing({ ...editing, options: [...editing.options, ''] })}>Add an answer</button>}
          </fieldset>
          <label className="block space-y-1"><span className="text-base text-white">Why (shown to people who get it wrong)</span>
            <textarea value={editing.why} maxLength={LIMITS.why} rows={2} onChange={e => setEditing({ ...editing, why: e.target.value })} className={field} />
          </label>
          {draftCheck && !draftCheck.ok && (editing.q || editing.why) && <p className="text-base text-white">{draftCheck.error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={small} disabled={busy === 'save' || !draftCheck?.ok}
              onClick={async () => { if (await send({ action: 'save', question: { ...editing, options: editing.options.filter(o => o.trim()) } }, 'save')) setEditing(null) }}>
              {busy === 'save' ? 'Saving…' : editing.id ? 'Save' : 'Add question'}
            </button>
            <button type="button" className={small} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      ) : (
        <button type="button" className={small} onClick={() => { setNotice(''); setEditing(empty(topic === 'all' ? 'studio' : topic)) }}>Add a question</button>
      )}

      {/* The list */}
      <section className="space-y-3" aria-label="Questions">
        <div className="flex flex-wrap gap-2 items-center">
          {(['all', ...TOPICS] as const).map(t => (
            <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}
              className={`px-4 min-h-11 text-base ops-btn`}>
              {t === 'all' ? `All (${bank?.questions.length ?? 0})` : `${TOPIC_LABEL[t].replace(' (not in the quiz now)', '').replace('Radio: ', '')} (${count(t)})`}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search questions" value={search} onChange={e => setSearch(e.target.value)} className={field} aria-label="Search questions" />

        {isAdmin && shown.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="text-base text-white font-semibold underline underline-offset-2" onClick={() => setPicked(p => (shown.every(q => p.has(q.id)) ? new Set() : new Set(shown.map(q => q.id))))}>
              {shown.every(q => picked.has(q.id)) ? 'Untick all' : `Tick all ${shown.length} shown`}
            </button>
            {picked.size > 0 && (confirmMany
              ? <>
                  <span className="text-base text-white">Delete {picked.size} {picked.size === 1 ? 'question' : 'questions'}? You can undo this once.</span>
                  <button type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={busy === 'many'} onClick={() => send({ action: 'deleteMany', ids: [...picked] }, 'many')}>Yes, delete</button>
                  <button type="button" className={small} onClick={() => setConfirmMany(false)}>Keep them</button>
                </>
              : <button type="button" className={small} onClick={() => setConfirmMany(true)}>Delete ticked ({picked.size})</button>)}
          </div>
        )}

        {bank && shown.length === 0 && <p className="text-base text-white">No questions match.</p>}
        <ul className="space-y-3">
          {shown.map(q => (
            <li key={q.id} className="ops-card p-4 space-y-2">
              <div className="flex gap-3 items-start">
                {isAdmin && <input type="checkbox" className="mt-1.5" aria-label={`Tick "${q.q}"`} checked={picked.has(q.id)}
                  onChange={() => setPicked(p => { const n = new Set(p); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n })} />}
                <div className="flex-1 space-y-1">
                  <p className="text-base text-white">{TOPIC_LABEL[q.topic]}</p>
                  <p className="text-base text-white font-semibold">{q.q}</p>
                  <ol className="space-y-0.5">
                    {q.options.map((o, i) => <li key={i} className={`text-base ${i === q.answer ? 'text-white font-semibold' : 'text-white'}`}>{answerLetter(i)}. {o}{i === q.answer ? ' (right)' : ''}</li>)}
                  </ol>
                  <p className="text-base text-white">Why: {q.why}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="text-base text-white font-semibold underline underline-offset-2" onClick={() => { setNotice(''); setEditing({ id: q.id, topic: q.topic, q: q.q, options: [...q.options], answer: q.answer, why: q.why }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                {confirmId === q.id
                  ? <>
                      <button type="button" className="text-base bg-white text-[#9d1c14] px-3 py-1 font-semibold underline" disabled={busy === q.id} onClick={() => send({ action: 'delete', id: q.id }, q.id)}>Yes, delete it</button>
                      <button type="button" className="text-base text-white underline" onClick={() => setConfirmId('')}>Keep it</button>
                    </>
                  : <button type="button" className="text-base text-white underline" onClick={() => setConfirmId(q.id)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Batch import */}
      <section className="space-y-3 pt-4 border-t border-white/15" aria-label="Import questions">
        <h2 className="text-white text-lg">Import questions</h2>
        <p className="text-base text-white">
          Paste or pick a CSV file with the columns <span className="font-mono">{CSV_HEADER.join(',')}</span> (answer is the letter of the right one,
          e and f can be left out), or a JSON list. Questions already in the bank are skipped. If any question has a problem, nothing is imported.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={small} onClick={() => download('quiz-template.csv', `${CSV_HEADER.join(',')}\nstudio,"The meter says ""Too loud"". What do you do?",Nothing,Turn the mixer down,Move the mic closer,Turn the speakers down,,,B,"Too loud means clipping, which distorts for every listener."\n`)}>Download a template</button>
          {bank && <button type="button" className={small} onClick={() => download('quiz-questions.csv', toCsv(bank.questions))}>Export all as CSV</button>}
          <label className={`${small} inline-flex items-center cursor-pointer`}>
            Pick a file
            <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={6} placeholder="Paste CSV or JSON here" aria-label="Questions to import" className={`${field} font-mono`} />
        {preview && (
          preview.errors.length
            ? <ul className="space-y-1" aria-label="Problems">{preview.errors.slice(0, 10).map(e => <li key={e} className="text-base bg-white text-[#9d1c14] px-3 py-1 font-semibold">{e}</li>)}{preview.errors.length > 10 && <li className="text-base text-white">…and {preview.errors.length - 10} more.</li>}</ul>
            : <p className="text-base text-white">Ready: {preview.add} new {preview.add === 1 ? 'question' : 'questions'}{preview.skipped ? `, ${preview.skipped} already in the bank` : ''}.</p>
        )}
        <button type="button" className={small} disabled={busy === 'import' || !preview || preview.errors.length > 0 || preview.add === 0}
          onClick={async () => { if (preview && await send({ action: 'import', rows: preview.rows }, 'import')) setImportText('') }}>
          {busy === 'import' ? 'Importing…' : 'Import'}
        </button>
      </section>

      {isAdmin && bank?.canUndo && (
        <section className="space-y-2 pt-4 border-t border-white/15">
          <h2 className="text-white text-lg">Undo</h2>
          <p className="text-base text-white">Puts the bank back to how it was before the last import or bulk delete.</p>
          <button type="button" className={small} disabled={busy === 'undo'} onClick={() => send({ action: 'undo' }, 'undo')}>Undo the last import or bulk delete</button>
        </section>
      )}
    </div>
  )
}
