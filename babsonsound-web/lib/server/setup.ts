import 'server-only'
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminDb } from './admin'
import type { Access } from './access'
import { deleteAccountData } from './deleteAccount'
import { HttpError, str } from './http'
import { encryptJson } from './pii'
import { normalizeUS } from '../phone'
import { hasPhone, savePhone } from './phoneStore'
import { judgeAge } from '../age'
import { cleanInstagram } from '../instagram'
import { AVATAR_COLORS } from '../profile'
import { validGradYear } from '../terms'
import { REQUIRED, STEP_IDS, isStepId, setupState, stepsFor, type SetupInput, type SetupState, type Skips, type StepId } from '../setup'

// Progressive setup, server side. The rules (order, back-off, one prompt per visit) are in lib/setup.ts.
// Stored on users/{uid}:  setup.skips.{stepId} = { count, lastShownAt, lastSkippedAt }  and  setup.lastPromptAt  (all ms).

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Everything the rules need, read from the profile and the sign-in token. */
export function setupInput(t: DecodedIdToken, a: Access, u: DocumentSnapshot): SetupInput {
  const raw = (u.get('setup.skips') ?? {}) as Record<string, Record<string, unknown> | undefined>
  const skips: Skips = {}
  for (const id of STEP_IDS) {
    const r = raw[id]
    if (r) skips[id] = { count: num(r.count), lastShownAt: num(r.lastShownAt), lastSkippedAt: num(r.lastSkippedAt) }
  }
  const avatar = u.get('avatarColor')
  return {
    level: a.level, demo: a.demo,
    emailVerified: t.email_verified === true,
    graceUntil: typeof t.graceUntil === 'number' ? t.graceUntil : null,
    joinedAt: (u.get('joinedAt') as Timestamp | undefined)?.toMillis?.() ?? null,
    firstName: String(u.get('firstName') ?? ''),
    avatarChosen: typeof avatar === 'string' && avatar !== '',
    birthdayDone: u.get('ageData') != null,
    gradYear: String(u.get('gradYear') ?? ''),
    hasPhone: hasPhone(u),
    hasInstagram: typeof u.get('instagram') === 'string' && u.get('instagram') !== '',
    skips, lastPromptAt: num(u.get('setup.lastPromptAt')),
  }
}

/**
 * The setup block for GET /api/me. `prompt` is true only when the app is asking at the start of a visit (/api/me?prompt=1):
 * then, if a step is being offered, it is recorded as shown and no other prompt goes out for 30 minutes. Other callers of
 * /api/me (profile page, host options...) just look, so they can never use up the prompt.
 */
export async function setupFor(t: DecodedIdToken, a: Access, u: DocumentSnapshot, prompt: boolean, now = Date.now()): Promise<SetupState> {
  const state = setupState(setupInput(t, a, u), now)
  if (prompt && state.next) {
    await u.ref.update({ 'setup.lastPromptAt': now, [`setup.skips.${state.next}.lastShownAt`]: now })
  }
  return state
}

/** The same state with the prompt already used up (what the skip and save routes send back). */
export const settled = (t: DecodedIdToken, a: Access, u: DocumentSnapshot, now = Date.now()) =>
  setupState({ ...setupInput(t, a, u), lastPromptAt: now }, now)

function checkStep(step: unknown, a: Access): StepId {
  if (!isStepId(step)) throw new HttpError(400, 'That setup step does not exist.', 'BR-SET-001')
  if (!stepsFor(a.level).includes(step)) throw new HttpError(403, 'That step is not part of your account.', 'BR-SET-002')
  return step
}

/** "Not now": counts the skip. Required steps cannot be skipped. */
export async function skipStep(t: DecodedIdToken, a: Access, rawStep: unknown, now = Date.now()): Promise<SetupState> {
  const step = checkStep(rawStep, a)
  if (REQUIRED[step]) throw new HttpError(400, 'That step cannot be skipped.', 'BR-SET-003')
  const ref = adminDb().collection('users').doc(t.uid)
  const before = await ref.get()
  if (!before.exists) throw new HttpError(404, 'Profile not found.')
  if (!settled(t, a, before, now).steps.find(s => s.id === step)?.done) {
    await ref.update({
      [`setup.skips.${step}.count`]: FieldValue.increment(1),
      [`setup.skips.${step}.lastSkippedAt`]: now,
      'setup.lastPromptAt': now,
    })
  }
  return settled(t, a, await ref.get(), now)
}

/** Validates and saves one step. */
export async function saveStep(t: DecodedIdToken, a: Access, rawStep: unknown, value: unknown, now = Date.now()): Promise<SetupState> {
  const step = checkStep(rawStep, a)
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const db = adminDb()
  const ref = db.collection('users').doc(t.uid)
  const u = await ref.get()
  if (!u.exists) throw new HttpError(404, 'Profile not found.')
  if (a.demo) return settled(t, a, u, now) // the Apple reviewer account has nothing to set up

  const update: Record<string, unknown> = {}
  switch (step) {
    case 'verifyEmail':
      // Done by clicking the link Firebase emails; there is nothing to save here.
      throw new HttpError(400, 'Open the link in your verification email to finish this step.', 'BR-SET-006')

    case 'name': {
      const firstName = str(v.firstName, 40), lastName = str(v.lastName, 60)
      if (!firstName) throw new HttpError(400, 'Enter your first name.', 'BR-SET-007')
      update.firstName = firstName; update.displayName = firstName
      if (lastName) update.lastName = lastName
      break
    }

    case 'avatar':
      if (!AVATAR_COLORS.some(c => c.id === v.avatarColor)) throw new HttpError(400, 'Pick one of the colors.', 'BR-SET-008')
      update.avatarColor = v.avatarColor
      break

    case 'birthday': {
      // Year is required; month and day are optional. A year alone is enough unless it falls on the 13 or 18 line.
      // "Use age range instead": { ageRange } with one of the About you ranges, for people who would rather not share a birthday.
      const RANGES = { under13: 'under13', '13-17': 'minor', '18-24': 'adult', '25plus': 'adult' } as const
      let saved: Record<string, unknown>
      let verdict: ReturnType<typeof judgeAge>
      if (typeof v.ageRange === 'string' && v.ageRange in RANGES) {
        verdict = { kind: RANGES[v.ageRange as keyof typeof RANGES] }
        saved = { ageRange: v.ageRange }
      } else {
        const year = Number(v.year)
        const month = v.month == null || v.month === '' ? null : Number(v.month)
        const day = v.day == null || v.day === '' ? null : Number(v.day)
        verdict = judgeAge(year, month, day, new Date(now))
        saved = { birthdate: { year, ...(month != null && day != null ? { month, day } : {}) } }
      }
      if (verdict.kind === 'invalid') throw new HttpError(400, 'Pick a real birthday.', 'BR-AGE-003')
      if (verdict.kind === 'under13') {
        // Same rule as About you: nothing is kept, the account and its info are deleted.
        await deleteAccountData(t.uid)
        throw new HttpError(403, 'Babson Radio is for people 13 and older. Your account and info were deleted.', 'BR-AGE-001')
      }
      if (verdict.kind === 'ask-more') throw new HttpError(400, 'Add your month and day so we can check your age.', 'BR-SET-004')
      const minor = verdict.kind === 'minor'
      if (minor && v.parentalConsent !== true) throw new HttpError(400, 'A parent or guardian needs to be okay with you using Babson Radio.', 'BR-AGE-002')
      // Encrypted like the About you step. "minor" is a plain yes/no so the server can act on it.
      update.ageData = encryptJson({ ...saved, savedAt: new Date(now).toISOString() })
      update.minor = minor
      update.parentalConsent = minor ? true : FieldValue.delete()
      if (u.get('onboardedAt') == null) update.onboardedAt = Timestamp.fromMillis(now)
      break
    }

    case 'gradYear': {
      // stepsFor() already turned Guests away; this is the second lock.
      if (a.level === 'guest') throw new HttpError(403, 'Graduation year is for students.', 'BR-SET-002')
      const y = str(v.gradYear, 10)
      if (!y || !validGradYear(y, new Date(now))) throw new HttpError(400, 'Pick a valid graduation year.', 'BR-ACC-018')
      update.gradYear = y
      break
    }

    case 'phone': {
      // stepsFor() already turned Guests away (a phone number only feeds the students' contact network).
      if (a.level === 'guest') throw new HttpError(403, 'Phone number is for students.', 'BR-SET-002')
      const phone = normalizeUS(str(v.phone, 30))
      if (!phone) throw new HttpError(400, 'Enter a valid 10-digit US phone number.', 'BR-ACC-004')
      if (hasPhone(u)) throw new HttpError(409, 'There is already a number on your account. Change it from your profile.', 'BR-SET-005')
      // Stored as phoneEncrypted + phoneHash + phoneVerified=false; Babson's own lines are refused (BR-SET-009).
      await savePhone(db, t.uid, phone)
      break
    }

    case 'instagram': {
      if (a.level === 'guest') throw new HttpError(403, 'Instagram is for students.', 'BR-SET-002')
      const handle = cleanInstagram(v.instagram)
      if (!handle) throw new HttpError(400, 'Enter your Instagram handle, like @name, or paste your profile link.', 'BR-SET-010')
      update.instagram = handle
      break
    }
  }
  if (Object.keys(update).length) await ref.update(update)
  return settled(t, a, await ref.get(), now)
}
