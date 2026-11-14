import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireDirector } from '@/lib/server/http'
import { accessOf } from '@/lib/server/access'
import { changeQuizBank, loadQuizBank } from '@/lib/server/quizBank'
import { mixProblem } from '@/lib/quizBank'

export const runtime = 'nodejs'

// Settings > Training quiz (/admin/quiz). E-board and Admins can read the bank, add, edit, import and delete one question.
// Only Admins can delete several at once and undo the last import or bulk delete.
//   GET  -> { questions, builtIn, updatedAt, updatedBy, lastAction, canUndo, problem }
//   POST { action: 'save', question } | { action: 'delete', id } | { action: 'import', rows } | { action: 'deleteMany', ids } | { action: 'undo' }
//        -> the same as GET, plus { note }
const view = (b: Awaited<ReturnType<typeof loadQuizBank>>) => ({ ...b, problem: mixProblem(b.questions) })

export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    return view(await loadQuizBank(adminDb(), true))
  }, { 'Cache-Control': 'private, no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireDirector(req)
    const b = await readJson(req)
    const admin = (await accessOf(t)).level === 'admin'
    const who = t.email ?? t.uid
    const action = String(b.action ?? '')
    let r
    if (action === 'save') r = await changeQuizBank(adminDb(), { action, question: b.question }, who)
    else if (action === 'delete') r = await changeQuizBank(adminDb(), { action, id: String(b.id ?? '') }, who)
    else if (action === 'import') {
      if (!Array.isArray(b.rows) || b.rows.length > 500) throw new HttpError(400, 'Import up to 500 questions at a time.')
      r = await changeQuizBank(adminDb(), { action, rows: b.rows.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') }, who)
    } else if (action === 'deleteMany' || action === 'undo') {
      if (!admin) throw new HttpError(403, 'Only Admins can delete questions in bulk or undo.')
      r = action === 'undo'
        ? await changeQuizBank(adminDb(), { action }, who)
        : await changeQuizBank(adminDb(), { action, ids: (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 500) }, who)
    } else throw new HttpError(400, 'Unknown action.')
    return { ...view(r.bank), note: r.note }
  }, { 'Cache-Control': 'private, no-store' })
}
