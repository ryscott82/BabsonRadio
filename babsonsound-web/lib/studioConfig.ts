import { PASS_PERCENT, QUIZ, TRAINING_VERSION, type QuizQuestion } from './training'
import { AGREEMENTS_VERSION, HOST_AGREEMENTS, type Agreement } from './conduct'

// What a Studio training session quizzes and has people sign. For now it reuses the questions in lib/training.ts and the
// agreements in lib/conduct.ts. When the real material arrives, change ONLY this file (and bump the ids): grants record the
// quizId and agreementVersion that were in force.
export interface StudioConfig {
  quizId: string
  passPercent: number
  questions: QuizQuestion[]
  agreementVersion: string
  agreements: Agreement[]
}

export const STUDIO_CONFIG: StudioConfig = {
  quizId: TRAINING_VERSION,
  passPercent: PASS_PERCENT,
  questions: QUIZ,
  agreementVersion: AGREEMENTS_VERSION,
  agreements: HOST_AGREEMENTS,
}

/** Questions without answers, for the browser and the app. */
export const publicStudioQuiz = () => STUDIO_CONFIG.questions.map(({ id, q, options }) => ({ id, q, options }))
