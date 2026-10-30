// Active account setup: every sign-in or visit, a pop-up asks for the next missing detail. The name cannot be dismissed; anything else
// that is dismissed is passed over and comes back after the other missing steps have been offered. Pure rules only (no server imports) so they can be tested.
// The server side is lib/server/setup.ts; the state it returns rides along on GET /api/me as `setup`.

import { VERIFY_GRACE_MS } from './verify-grace.ts'

/** In the order they are offered. iOS adds contacts later. */
export const STEP_IDS = ['verifyEmail', 'name', 'birthday', 'gradYear', 'phone', 'instagram', 'avatar'] as const
export type StepId = (typeof STEP_IDS)[number]
export const isStepId = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v)

/** The email (by its deadline) and the name are required: the name cannot be dismissed. Everything else can be skipped and comes back. */
export const REQUIRED: Record<StepId, boolean> = { verifyEmail: true, name: true, avatar: false, birthday: false, gradYear: false, phone: false, instagram: false }

export interface SkipRec { count: number; lastShownAt: number; lastSkippedAt: number }
export type Skips = Partial<Record<StepId, Partial<SkipRec>>>

/** Which steps apply to a person. Graduation year, phone and Instagram are for students (and above) only: a Guest never sees them. Pick-your-color is always last. */
const STUDENT_ONLY: readonly StepId[] = ['gradYear', 'phone', 'instagram']
export const stepsFor = (level: string): StepId[] => STEP_IDS.filter(id => !STUDENT_ONLY.includes(id) || level !== 'guest')

export interface SetupInput {
  level: string
  /** The Apple reviewer account: nothing to set up. */
  demo: boolean
  emailVerified: boolean
  /** ms, the `graceUntil` claim on the sign-in token (if any). */
  graceUntil: number | null
  /** ms the profile was created (fallback for the email deadline). */
  joinedAt: number | null
  firstName: string
  avatarChosen: boolean
  birthdayDone: boolean
  gradYear: string
  hasPhone: boolean
  hasInstagram: boolean
  skips: Skips
  /** Set when a birthday is on file: a graduation choice to pre-select. */
  gradGuess?: string
}

export interface SetupState {
  steps: { id: StepId; done: boolean; required: boolean }[]
  /** The one step to ask about now, or null (everything done).
   *  Never verifyEmail: verifying is not asked in a prompt. It has its own banner (and a deadline), so the other steps are still offered meanwhile. */
  next: StepId | null
  /** Pre-selected graduation choice for the grad year step, if we could guess one. */
  gradGuess: string | null
  doneCount: number
  total: number
  /** ms deadline to verify the email, while the email is not verified; else null. */
  emailDeadlineAt: number | null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setupState(i: SetupInput, _now: number): SetupState {
  const doneBy: Record<StepId, boolean> = {
    verifyEmail: i.emailVerified,
    name: i.firstName.trim().length > 0,
    avatar: i.avatarChosen,
    birthday: i.birthdayDone,
    gradYear: i.gradYear !== '',
    phone: i.hasPhone,
    instagram: i.hasInstagram,
  }
  const steps = stepsFor(i.level).map(id => ({ id, done: i.demo || doneBy[id], required: REQUIRED[id] }))
  const doneCount = steps.filter(s => s.done).length
  const emailDeadlineAt = i.demo || i.emailVerified ? null : i.graceUntil ?? (i.joinedAt ? i.joinedAt + VERIFY_GRACE_MS : null)
  // Required steps first (the name), then the rest in order. A step that was dismissed goes behind the ones not yet dismissed, oldest dismissal first.
  const open = steps.filter(s => s.id !== 'verifyEmail' && !s.done)
  const order = (id: StepId) => STEP_IDS.indexOf(id)
  const rank = (s: { id: StepId; required: boolean }) => [s.required ? 0 : 1, i.skips[s.id]?.lastSkippedAt ?? 0, order(s.id)]
  open.sort((x, y) => { const a = rank(x), b = rank(y); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] })
  const next: StepId | null = open[0]?.id ?? null
  return { steps, next, gradGuess: i.gradGuess || null, doneCount, total: steps.length, emailDeadlineAt }
}
