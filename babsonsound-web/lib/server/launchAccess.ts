import 'server-only'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { HttpError } from './http'
import { accessOf, forgetAccess } from './access'
import { launchOpen, lockedUserMayCall } from '../launchLock'

// Before the launch time only admins, directors and radio-trained students may use the site. Everyone else is "locked".
// The lock lifts by the clock (LAUNCH_AT in lib/launchLock.ts) or by LAUNCH_OPEN=1. No redeploy.

/** True if this signed-in person may use the site before launch. Uses the cached access lookup (about 45s). */
export async function hasEarlyAccess(t: DecodedIdToken): Promise<boolean> {
  const a = await accessOf(t)
  return a.level === 'admin' || a.level === 'director' || a.radio
}
export const forgetEarlyAccess = forgetAccess

/** Locked = before the launch time and no early access. */
export async function isLocked(t: DecodedIdToken): Promise<boolean> {
  return !launchOpen() && !(await hasEarlyAccess(t))
}

/** Called for every signed-in API request (see requireUser). Locked people can only reach the few routes in lockedUserMayCall. */
export async function enforceLaunchLock(req: Request, t: DecodedIdToken): Promise<void> {
  if (launchOpen()) return
  let path = ''
  try { path = new URL(req.url).pathname } catch { /* no URL: treat as a normal route */ }
  if (path && lockedUserMayCall(path)) return
  if (await hasEarlyAccess(t)) return
  throw new HttpError(403, 'Babson Radio opens October 30 at 3 pm. Your account is ready.', 'BR-PRE-003')
}
