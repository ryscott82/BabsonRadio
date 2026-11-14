import type { Firestore } from 'firebase-admin/firestore'
import { QUIZ, type QuizQuestion } from '../training'
import { checkQuestion, mixProblem, planImport } from '../quizBank'
import { HttpError } from './http'

// The training quiz question bank: one document, config/quizBank { questions, updatedAt, updatedBy, lastAction, previous }.
// Until the first save from Settings > Training quiz it is the built-in list in lib/training.ts. Read with a 60 s cache per server
// (like the blocked words), so a quiz costs no extra reads. `previous` keeps the bank as it was before the last import or bulk delete,
// for Undo.

const ref = (db: Firestore) => db.collection('config').doc('quizBank')
let cache: { at: number; bank: Bank } | null = null

export interface Bank { questions: QuizQuestion[]; builtIn: boolean; updatedAt: number | null; updatedBy: string; lastAction: string; canUndo: boolean }

function fromDoc(d: FirebaseFirestore.DocumentSnapshot): Bank {
  const list = d.exists && Array.isArray(d.get('questions')) ? (d.get('questions') as QuizQuestion[]) : null
  return {
    questions: list ?? QUIZ,
    builtIn: !list,
    updatedAt: d.get('updatedAt')?.toMillis?.() ?? null,
    updatedBy: String(d.get('updatedBy') ?? ''),
    lastAction: String(d.get('lastAction') ?? ''),
    canUndo: Array.isArray(d.get('previous')?.questions),
  }
}

export async function loadQuizBank(db: Firestore, fresh = false): Promise<Bank> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.bank
  const bank = fromDoc(await ref(db).get())
  cache = { at: Date.now(), bank }
  return bank
}

export type BankChange =
  | { action: 'save'; question: unknown }
  | { action: 'delete'; id: string }
  | { action: 'import'; rows: Record<string, unknown>[] }
  | { action: 'deleteMany'; ids: string[] }
  | { action: 'undo' }

/** Applies one change in a transaction on the latest bank. Refuses anything that would leave the bank unable to fill a quiz. */
export async function changeQuizBank(db: Firestore, change: BankChange, who: string): Promise<{ bank: Bank; note: string }> {
  let note = ''
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref(db))
    const cur = fromDoc(snap).questions
    let next: QuizQuestion[]
    let keepPrevious = false
    let label: string = change.action
    if (change.action === 'save') {
      const raw = (change.question && typeof change.question === 'object' ? change.question : {}) as Record<string, unknown>
      const editing = typeof raw.id === 'string' ? cur.find(q => q.id === raw.id) : undefined
      const c = checkQuestion(raw, new Set(cur.filter(q => q !== editing).map(q => q.id)))
      if (!c.ok) throw new HttpError(400, c.error)
      if (!editing && cur.some(q => q.q.toLowerCase() === c.question.q.toLowerCase())) throw new HttpError(409, 'That question is already in the bank.')
      next = editing ? cur.map(q => (q === editing ? c.question : q)) : [...cur, c.question]
      note = editing ? 'Saved.' : 'Added.'
      label = editing ? `edited ${c.question.id}` : `added ${c.question.id}`
    } else if (change.action === 'delete') {
      if (!cur.some(q => q.id === change.id)) throw new HttpError(404, 'That question is not in the bank any more.')
      next = cur.filter(q => q.id !== change.id)
      note = 'Deleted.'
      label = `deleted ${change.id}`
    } else if (change.action === 'import') {
      const plan = planImport(cur, change.rows)
      if (plan.errors.length) throw new HttpError(400, plan.errors.slice(0, 8).join('\n') + (plan.errors.length > 8 ? `\n…and ${plan.errors.length - 8} more.` : ''))
      if (!plan.add.length) throw new HttpError(400, plan.skipped ? 'Every question in the import is already in the bank.' : 'There were no questions to import.')
      next = [...cur, ...plan.add]
      keepPrevious = true
      note = `Imported ${plan.add.length} ${plan.add.length === 1 ? 'question' : 'questions'}${plan.skipped ? `, skipped ${plan.skipped} already in the bank` : ''}.`
      label = `imported ${plan.add.length}`
    } else if (change.action === 'deleteMany') {
      const ids = new Set(change.ids)
      next = cur.filter(q => !ids.has(q.id))
      const n = cur.length - next.length
      if (!n) throw new HttpError(400, 'Pick questions to delete first.')
      keepPrevious = true
      note = `Deleted ${n} ${n === 1 ? 'question' : 'questions'}.`
      label = `deleted ${n}`
    } else {
      const prev = snap.get('previous')?.questions
      if (!Array.isArray(prev)) throw new HttpError(400, 'There is nothing to undo.')
      next = prev as QuizQuestion[]
      note = 'Undone.'
      label = `undid ${String(snap.get('previous')?.action ?? 'the last change')}`
    }
    const problem = mixProblem(next)
    if (problem) throw new HttpError(400, problem)
    tx.set(ref(db), {
      questions: next, updatedAt: new Date(), updatedBy: who, lastAction: label,
      // Undo goes back one import or bulk delete. An undo clears it (no redo), any other change keeps it.
      previous: keepPrevious ? { questions: cur, action: label, at: new Date() } : change.action === 'undo' ? null : (snap.get('previous') ?? null),
    })
  })
  cache = null
  return { bank: await loadQuizBank(db, true), note }
}
