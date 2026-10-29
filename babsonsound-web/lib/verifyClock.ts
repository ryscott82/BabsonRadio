// The email-verification clock. Plain functions (no server imports) so the tests can load them.
//
//   day 0 → 7   graceUntil: everything works as before
//   day 7 →     locked until the email is verified (the server lets only /api/me, /api/auth and a few account routes through)
//   day 10      one reminder email
//   day 14      the account and its data are deleted, which also frees the email for its real owner
//
// "Day 7" is the account's `graceUntil` claim. Apple accounts get that claim when they set a school email, so they follow
// the same clock from that moment. The demo / App Store reviewer account is never touched (callers pass `exempt`).
import { VERIFY_GRACE_MS } from './verify-grace.ts'

const DAY = 24 * 60 * 60 * 1000
export const REMIND_AFTER_MS = 3 * DAY // day 10 when grace is 7 days
export const DELETE_AFTER_MS = 7 * DAY // day 14

export type VerifyStage = 'verified' | 'grace' | 'locked' | 'remind' | 'delete' | 'exempt'

export type ClockInput = {
  emailVerified: boolean
  /** the `graceUntil` custom claim (ms), if any */
  graceUntil: number | null | undefined
  /** account creation time (ms), used only when there is no claim */
  createdMs: number
  now: number
  /** demo / reviewer account */
  exempt?: boolean
}

/** When the grace period ends: the claim, or 7 days after the account was made. */
export const graceEnd = (graceUntil: number | null | undefined, createdMs: number) =>
  typeof graceUntil === 'number' && graceUntil > 0 ? graceUntil : createdMs + VERIFY_GRACE_MS

/** Where an account is on the clock. `remind` and `delete` are both also locked. */
export function verifyStage(i: ClockInput): VerifyStage {
  if (i.exempt) return 'exempt'
  if (i.emailVerified) return 'verified'
  const end = graceEnd(i.graceUntil, i.createdMs)
  if (i.now < end) return 'grace'
  if (i.now >= end + DELETE_AFTER_MS) return 'delete'
  if (i.now >= end + REMIND_AFTER_MS) return 'remind'
  return 'locked'
}

/** Locked means: unverified and past grace. The server then allows only the routes below. */
export const isLockedStage = (s: VerifyStage) => s === 'locked' || s === 'remind' || s === 'delete'

/** The only API paths a locked account can reach: its own profile read, sign-in helpers, and the account/verification routes. */
const LOCKED_OK = [
  /^\/api\/me$/, /^\/api\/auth(\/|$)/, /^\/api\/me\/delete$/, /^\/api\/me\/school-email$/, /^\/api\/guest\/status$/, /^\/api\/launch\/pass$/,
]
export const lockedMayCall = (pathname: string) => LOCKED_OK.some(r => r.test(pathname))
