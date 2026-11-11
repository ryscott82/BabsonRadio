import { cleanOr } from './wordFilter'
import 'server-only'
import { Timestamp } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminDb } from './admin'
import { isSchoolEmail } from './access'
import { TERMS_VERSION } from '../terms'

/** username rule shared with sign-up: the part before the @ (Olin and Wellesley get a suffix, other domains get their first label). */
export function usernameOf(email: string): string {
  const at = email.indexOf('@')
  const dom = email.slice(at + 1, email.indexOf('.', at))
  return dom === 'babson' ? email.slice(0, at) : `${email.slice(0, at)}-${dom}`
}

/**
 * Makes sure the signed-in person has a profile (users/{uid}). A safety net for a sign-up that stopped before its profile was written.
 * A school email makes them a student, anything else a guest. Name, phone, grad year and birthday are asked later, one at a time (lib/setup.ts).
 * Safe to call again: an existing profile is never changed. Returns true when it created one.
 */
export async function ensureProfile(t: DecodedIdToken, opts: { agreed?: boolean; launchNotice?: boolean; firstName?: string } = {}): Promise<boolean> {
  const email = (t.email ?? '').toLowerCase()
  if (!email) return false
  const ref = adminDb().collection('users').doc(t.uid)
  const school = isSchoolEmail(email)
  // A name from the sign-in token (a sign-in provider) is only a starting point: it skips our forms, so it goes through the word filter.
  const first = await cleanOr(adminDb(), (opts.firstName ?? '').trim().slice(0, 40) || (t.name ?? '').split(' ')[0] || '')
  try {
    await ref.create({
      firstName: first, lastName: '', username: usernameOf(email), displayName: first || email.split('@')[0],
      email, gradYear: '',
      level: school ? 'student' : 'guest', accountType: school ? 'babson' : 'guest',
      studioTrained: false, radioTrained: false,
      ...(opts.agreed ? { termsAcceptedAt: Timestamp.now(), termsVersion: TERMS_VERSION } : {}),
      ...(opts.launchNotice === false ? {} : { launchNoticeConsentAt: Timestamp.now() }),
      notifyNewEpisode: [], notifyGoesLive: [], joinedAt: Timestamp.now(),
    })
    return true
  } catch (e) {
    if ((e as { code?: number | string }).code === 6 || (e as { code?: string }).code === 'already-exists') return false
    throw e
  }
}
