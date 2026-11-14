import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson } from '@/lib/server/http'
import { checkSignature } from '@/lib/server/conduct'
import { studioActor, writeGrants } from '@/lib/server/studio'
import { loadStudioForm } from '@/lib/server/studioForm'
import { loadQuizBank } from '@/lib/server/quizBank'
import { STUDIO_CONFIG } from '@/lib/studioConfig'
import { badgeExpiry, gradeQuiz } from '@/lib/studioRules'
import { QUIZ_VALID_MS, SELF_MIN_WATCH_MS, SELF_PASS_PERCENT, SELF_QUESTIONS, drawQuiz, selfQuizGate, watchLeftSec } from '@/lib/selfTraining'

export const runtime = 'nodejs'

// Radio room training you take yourself (the QR code on the studio door leads here after sign-up). Students only (guests get 403 BR-PERM-001).
//   GET  -> { trained: true, formUrl, embed }  when they already are (or are a director or admin), so the last step can be shown again;
//           otherwise { trained: false, videoId, watchLeftSec, passPercent, questions (no answers), agreements, agreementVersion }.
//           The first GET starts the clock: the quiz opens SELF_MIN_WATCH_MS later.
//   POST { answers } -> every answer must be right. Fail: { quizOk: false, wrong: [{ id, q, why }] } (a new draw next time). Pass: { quizOk: true }.
//   POST { agreement } -> within an hour of a perfect quiz: the agreement is checked and signed, both badges are granted,
//           and { passed: true, formUrl, embed } is returned.
// The access form's address is handed out only here, to someone who passed, so it is not something to forward.
const doc = (uid: string) => adminDb().collection('trainingSelf').doc(uid)
const num = (v: unknown) => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? 0

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await studioActor(req)
    const now = Date.now()
    if (actor.a.level !== 'student' || (actor.a.studio && actor.a.radio)) {
      const f = await loadStudioForm()
      return { trained: true, formUrl: f.url, embed: f.embed }
    }
    const ref = doc(actor.t.uid), snap = await ref.get()
    let startedAt = num(snap.get('startedAt'))
    if (!startedAt) { startedAt = now; await ref.set({ startedAt: Timestamp.fromMillis(now), attempts: 0 }, { merge: true }) }
    const attempts = Number(snap.get('attempts') ?? 0)
    // The questions come from the bank edited on Settings > Training quiz. The ids shown are saved, so grading uses the same
    // questions even if the bank changes in between (or another server still has the old bank cached).
    const bank = (await loadQuizBank(adminDb())).questions
    const kept = snap.get('drawnAttempt') === attempts && Array.isArray(snap.get('drawnIds')) ? (snap.get('drawnIds') as string[]) : null
    const keptQs = kept?.map(id => bank.find(q => q.id === id)).filter(q => q != null)
    const drawn = keptQs && keptQs.length === kept!.length ? keptQs : drawQuiz(bank, SELF_QUESTIONS, `${actor.t.uid}:${attempts}`)
    if (!keptQs || keptQs.length !== kept!.length) await ref.set({ drawnIds: drawn.map(q => q.id), drawnAttempt: attempts }, { merge: true })
    const pub = drawn.map(({ id, q, options }) => ({ id, q, options }))
    return {
      trained: false, videoId: process.env.STUDIO_TRAINING_VIDEO_ID || process.env.BOOTH_TRAINING_VIDEO_ID || '',
      watchLeftSec: watchLeftSec(startedAt, now), minWatchSec: Math.round(SELF_MIN_WATCH_MS / 1000), passPercent: SELF_PASS_PERCENT,
      questions: pub, agreements: STUDIO_CONFIG.agreements, agreementVersion: STUDIO_CONFIG.agreementVersion,
    }
  }, { 'Cache-Control': 'private, no-store' })
}

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await studioActor(req)
    if (actor.a.level !== 'student' || (actor.a.studio && actor.a.radio)) {
      const f = await loadStudioForm()
      return { passed: true, already: true, formUrl: f.url, embed: f.embed }
    }
    const b = await readJson(req)
    const uid = actor.t.uid, now = Date.now()
    const ref = doc(uid), snap = await ref.get()

    // Step 2: the agreement. Only right after a perfect quiz (within an hour). Signing grants both badges.
    if (b.agreement) {
      const passedAt = num(snap.get('quizPassedAt'))
      if (!passedAt || now - passedAt > QUIZ_VALID_MS) throw new HttpError(403, 'Take the quiz first.', 'BR-STU-013')
      const sig = checkSignature(b.agreement, STUDIO_CONFIG.agreementVersion, 'BR-STU-017')
      await adminDb().collection('conductConsents').add({
        uid, email: actor.t.email ?? '', typedName: sig.typedName, kind: 'studio-training', version: sig.version,
        scopeKind: 'selfServe', scopeId: 'door', signedAt: Timestamp.fromMillis(now),
      })
      const granted = await writeGrants(adminDb(), (['studio', 'radio'] as const).map(badge => ({
        uid, badge, sessionId: 'self', trainerUid: '', quizId: STUDIO_CONFIG.quizId, quizScore: SELF_PASS_PERCENT,
        agreementVersion: STUDIO_CONFIG.agreementVersion, grantedBy: 'system' as const,
      })), now, false)
      await ref.set({ signedAt: Timestamp.fromMillis(now) }, { merge: true })
      const f = await loadStudioForm()
      return { passed: true, granted, expiresAt: badgeExpiry(now), formUrl: f.url, embed: f.embed }
    }

    // Step 1: the quiz.
    const gate = selfQuizGate({ startedAt: num(snap.get('startedAt')), lastAttemptAt: num(snap.get('lastAttemptAt')), now })
    if (!gate.ok) throw new HttpError(gate.status, gate.message, gate.code)
    const attempts = Number(snap.get('attempts') ?? 0)
    const bank = (await loadQuizBank(adminDb())).questions
    const shownIds = snap.get('drawnAttempt') === attempts && Array.isArray(snap.get('drawnIds')) ? (snap.get('drawnIds') as string[]) : null
    const drawn = shownIds ? shownIds.map(id => bank.find(q => q.id === id)).filter(q => q != null) : drawQuiz(bank, SELF_QUESTIONS, `${uid}:${attempts}`)
    if (shownIds && drawn.length !== shownIds.length) throw new HttpError(409, 'The quiz questions were just changed. Reload the page for a new set.')
    const answers = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>
    const graded = gradeQuiz(drawn, answers, SELF_PASS_PERCENT)
    if (!graded) throw new HttpError(400, 'Answer every question first.', 'BR-STU-015')
    await ref.set({ lastAttemptAt: Timestamp.fromMillis(now), lastScore: graded.percent, attempts: attempts + 1, ...(graded.passed ? { quizPassedAt: Timestamp.fromMillis(now) } : {}) }, { merge: true })
    if (graded.passed) return { quizOk: true }
    return {
      quizOk: false, percent: graded.percent, passPercent: SELF_PASS_PERCENT,
      wrong: drawn.filter(q => graded.wrong.includes(q.id)).map(q => ({ id: q.id, q: q.q, why: q.why })),
    }
  }, { 'Cache-Control': 'private, no-store' })
}
