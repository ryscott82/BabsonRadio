// Small helpers shared by the setup banner and the setup prompt (components/setup/*). Browser only.
import type { SetupState, StepId } from './setup'

/** The modal shows these. "verify" is the email step, which has no form (the banner and this view just resend the email). */
export type PromptStep = Exclude<StepId, 'verifyEmail'> | 'verify'

/** The banner (or anything else) asks the prompt to open now, skipping the once-per-visit waiting rules. */
export const openSetup = (step?: PromptStep) => window.dispatchEvent(new CustomEvent<PromptStep | undefined>('br:setup-open', { detail: step }))

/** First step the person still has to do, in order. Email verification comes last here because it has its own banner state. */
export function firstMissing(s: SetupState | null): PromptStep | null {
  const todo = s?.steps.filter(x => !x.done) ?? []
  const other = todo.find(x => x.id !== 'verifyEmail')
  return other ? (other.id as PromptStep) : todo.length ? 'verify' : null
}

const DAY = 24 * 60 * 60 * 1000
/** The banner turns amber for the last 2 days of the 7-day email window (from day 5 on). */
export const amberFrom = (deadline: number | null) => (deadline ? deadline - 2 * DAY : null)
