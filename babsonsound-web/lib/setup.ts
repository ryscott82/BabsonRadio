// Progressive account setup ("Google style"): after sign-up the app asks for one more detail at a time, never more than one
// prompt per visit, and backs off when someone says "not now". Pure rules only (no server imports) so they can be tested.
// The server side is lib/server/setup.ts; the state it returns rides along on GET /api/me as `setup`.

import { VERIFY_GRACE_MS } from './verify-grace.ts'

/** In the order they are offered. iOS adds contacts later. */
export const STEP_IDS = ['verifyEmail', 'name', 'avatar', 'birthday', 'gradYear', 'phone'] as const
export type StepId = (typeof STEP_IDS)[number]
export const isStepId = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v)

/** Only verifying the email is required (by its deadline). Everything else can be skipped. */
export const REQUIRED: Record<StepId, boolean> = { verifyEmail: true, name: false, avatar: false, birthday: false, gradYear: false, phone: false }

/** At most one prompt in this window, however many times the app asks (a "visit"). */
export const PROMPT_GAP_MS = 30 * 60_000
/** A skipped step comes back on the next visit until it has been skipped this many times... */
export const SKIPS_BEFORE_BACKOFF = 3
/** ...then it is offered at most once in this long. */
export const BACKOFF_MS = 7 * 24 * 60 * 60_000

export interface SkipRec { count: number; lastShownAt: number; lastSkippedAt: number }
export type Skips = Partial<Record<StepId, Partial<SkipRec>>>

/** Which steps apply to a person. Graduation year and phone are for students (and above) only: a Guest never sees them. Phone is always the last step. */
export const stepsFor = (level: string): StepId[] => STEP_IDS.filter(id => (id !== 'gradYear' && id !== 'phone') || level !== 'guest')

/** Whether a step that is not done may be offered right now (before the one-prompt-per-visit check). */
export function offerable(rec: Partial<SkipRec> | undefined, now: number): boolean {
  const count = rec?.count ?? 0
  if (count < SKIPS_BEFORE_BACKOFF) return true
  return now - Math.max(rec?.lastShownAt ?? 0, rec?.lastSkippedAt ?? 0) >= BACKOFF_MS
}

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
  skips: Skips
  /** ms of the last prompt that was handed out (0 = never). */
  lastPromptAt: number
}

export interface SetupState {
  steps: { id: StepId; done: boolean; required: boolean }[]
  /** The one step to ask about now, or null (everything done, nothing offerable, or a prompt already went out in the last 30 minutes).
   *  Never verifyEmail: verifying is not asked in a prompt. It has its own banner (and a deadline), so the other steps are still offered meanwhile. */
  next: StepId | null
  doneCount: number
  total: number
  /** ms deadline to verify the email, while the email is not verified; else null. */
  emailDeadlineAt: number | null
}

export function setupState(i: SetupInput, now: number): SetupState {
  const doneBy: Record<StepId, boolean> = {
    verifyEmail: i.emailVerified,
    name: i.firstName.trim().length > 0,
    avatar: i.avatarChosen,
    birthday: i.birthdayDone,
    gradYear: i.gradYear !== '',
    phone: i.hasPhone,
  }
  const steps = stepsFor(i.level).map(id => ({ id, done: i.demo || doneBy[id], required: REQUIRED[id] }))
  const doneCount = steps.filter(s => s.done).length
  const emailDeadlineAt = i.demo || i.emailVerified ? null : i.graceUntil ?? (i.joinedAt ? i.joinedAt + VERIFY_GRACE_MS : null)
  let next: StepId | null = null
  if (now - i.lastPromptAt >= PROMPT_GAP_MS) {
    next = steps.find(s => s.id !== 'verifyEmail' && !s.done && offerable(i.skips[s.id], now))?.id ?? null
  }
  return { steps, next, doneCount, total: steps.length, emailDeadlineAt }
}
