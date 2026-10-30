import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { checkSignature } from '@/lib/server/conduct'
import { attendanceId, loadSession, ms, must, studioActor, writeGrants, type Actor } from '@/lib/server/studio'
import { STUDIO_CONFIG, publicStudioQuiz } from '@/lib/studioConfig'
import { badgeExpiry, gradeQuiz, planGrants, quizGate } from '@/lib/studioRules'

export const runtime = 'nodejs'

/** The quiz and the agreement open only after the trainer confirmed this person attended this session. */
async function confirmedRow(actor: Actor, sessionId: string) {
  const db = adminDb()
  const s = await loadSession(db, sessionId)
  const ref = db.collection('trainingAttendance').doc(attendanceId(sessionId, actor.t.uid))
  const row = await ref.get()
  must(quizGate({
    level: actor.a.level, emailVerified: actor.t.email_verified === true, demo: actor.a.demo,
    row: row.exists ? { confirmedAt: ms(row.get('confirmedAt')), removedAt: ms(row.get('removedAt')), checkedInAt: ms(row.get('checkedInAt')) } : null,
  }))
  return { db, s, ref, row }
}

// GET ?sessionId= — questions (no answers) and the agreement. Directors and admins skip training.
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await studioActor(req)
    if (actor.a.level !== 'student') return { skipped: true }
    const sessionId = str(new URL(req.url).searchParams.get('sessionId'), 128)
    const { s } = await confirmedRow(actor, sessionId)
    return {
      skipped: false, sessionId, covers: s.covers, passPercent: STUDIO_CONFIG.passPercent,
      questions: publicStudioQuiz(), agreements: STUDIO_CONFIG.agreements, agreementVersion: STUDIO_CONFIG.agreementVersion,
    }
  })
}

// POST { sessionId, answers: {questionId: optionIndex}, agreement: {typedName, accepted: true, version} }
// Grants every badge the session covers when the quiz is passed and the agreement is signed. Radio needs a Studio badge
// already held or granted by this same session.
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await studioActor(req)
    if (actor.a.level !== 'student') return { skipped: true, passed: true }
    const b = await readJson(req)
    const sessionId = str(b.sessionId, 128)
    const { db, s, ref, row } = await confirmedRow(actor, sessionId)
    const uid = actor.t.uid, now = Date.now()

    const plan = planGrants(s.covers, actor.a.studio)
    if (!plan.ok) throw new HttpError(403, 'Radio training needs Studio training first.', 'BR-STU-014')

    // Already granted by this session: nothing to do.
    const have = await db.getAll(...plan.badges.map(bd => db.collection('trainingGrants').doc(`${sessionId}_${uid}_${bd}`)))
    if (have.every(d => d.exists)) return { passed: true, already: true, granted: [], expiresAt: badgeExpiry(now) }

    const last = row.get('lastAttemptAt')?.toMillis?.() ?? 0
    if (now - last < 20_000) throw new HttpError(429, 'Take a moment to read the explanations before trying again.', 'BR-STU-016')
    const answers = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>
    const graded = gradeQuiz(STUDIO_CONFIG.questions, answers, STUDIO_CONFIG.passPercent)
    if (!graded) throw new HttpError(400, 'Answer every question first.', 'BR-STU-015')

    if (!graded.passed) {
      await ref.update({ lastAttemptAt: Timestamp.fromMillis(now), lastScore: graded.percent, quizAttempts: (row.get('quizAttempts') ?? 0) + 1 })
      return {
        passed: false, percent: graded.percent, passPercent: STUDIO_CONFIG.passPercent,
        wrong: STUDIO_CONFIG.questions.filter(q => graded.wrong.includes(q.id)).map(q => ({ id: q.id, why: q.why })),
      }
    }

    // Passed: the agreement is checked now, so a failed quiz never asks for a signature. A bad signature grants nothing.
    const sig = checkSignature(b.agreement, STUDIO_CONFIG.agreementVersion, 'BR-STU-017')
    await db.collection('conductConsents').add({
      uid, email: actor.t.email ?? '', typedName: sig.typedName, kind: 'studio-training', version: sig.version,
      scopeKind: 'trainingSession', scopeId: sessionId, signedAt: Timestamp.fromMillis(now),
    })
    const granted = await writeGrants(db, plan.badges.map(badge => ({
      uid, badge, sessionId, trainerUid: s.trainerUid, quizId: STUDIO_CONFIG.quizId, quizScore: graded.percent,
      agreementVersion: STUDIO_CONFIG.agreementVersion, grantedBy: 'system' as const,
    })), now, true)
    await ref.update({ quizPassedAt: Timestamp.fromMillis(now), lastScore: graded.percent, quizAttempts: (row.get('quizAttempts') ?? 0) + 1, grantedAt: Timestamp.fromMillis(now) })
    return { passed: true, percent: graded.percent, passPercent: STUDIO_CONFIG.passPercent, granted, expiresAt: badgeExpiry(now) }
  })
}
