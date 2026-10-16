import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember } from '@/lib/server/http'
import { readiness } from '@/lib/server/conduct'
import { PASS_PERCENT, QUIZ, TRAINING_VERSION, publicQuiz } from '@/lib/training'
import { AGREEMENTS_VERSION, HOST_AGREEMENTS } from '@/lib/conduct'

export const runtime = 'nodejs'

// The certification quiz. GET gives the questions (no answers) and your status. POST grades your answers on the server.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const db = adminDb()
    const [r, tr] = await Promise.all([readiness(db, t), db.collection('training').doc(t.uid).get()])
    return {
      trained: r.trained, staff: r.staff, requested: r.trainingRequested,
      certifiedAt: tr.get('certifiedAt')?.toMillis?.() ?? null, passPercent: PASS_PERCENT,
      checkIn: r.checkIn, conductSigned: r.conductSigned,
      // The app shows the same agreements the website does.
      agreements: HOST_AGREEMENTS, agreementsVersion: AGREEMENTS_VERSION,
      // The quiz only opens after an admin confirms the person is at an in-person training.
      questions: r.quizUnlocked ? publicQuiz() : [],
    }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const answers = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>
    const db = adminDb()
    if (!(await readiness(db, t)).quizUnlocked) throw new HttpError(403, 'Check in at your training first. A director confirms it and the quiz opens.', 'BR-TRN-004')
    const ref = db.collection('training').doc(t.uid)
    const prev = await ref.get()
    const last = prev.get('lastAttemptAt')?.toMillis?.() ?? 0
    if (Date.now() - last < 20_000) throw new HttpError(429, 'Take a moment to read the explanations before trying again.', 'BR-TRN-002')
    if (QUIZ.some(q => typeof answers[q.id] !== 'number')) throw new HttpError(400, 'Answer every question first.', 'BR-TRN-003')

    const wrong = QUIZ.filter(q => answers[q.id] !== q.answer)
    const percent = Math.round(((QUIZ.length - wrong.length) / QUIZ.length) * 100)
    const passed = percent >= PASS_PERCENT
    const now = Timestamp.now()
    const base = { lastAttemptAt: now, lastScore: percent, attempts: (prev.get('attempts') ?? 0) + 1 }
    if (passed) {
      await ref.set({ ...base, certifiedAt: prev.get('certifiedAt') ?? now, version: TRAINING_VERSION, score: percent, revokedAt: null, certifiedBy: 'quiz' }, { merge: true })
    } else {
      await ref.set(base, { merge: true })
    }
    return { passed, percent, passPercent: PASS_PERCENT, wrong: wrong.map(q => ({ id: q.id, why: q.why })) }
  })
}
