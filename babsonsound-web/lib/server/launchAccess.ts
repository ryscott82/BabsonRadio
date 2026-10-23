import 'server-only'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminDb } from './admin'
import { isTester } from './testers'
import { HttpError, isDeveloperToken } from './http'
import { launchOpen, lockedUserMayCall } from '../launchLock'

// Who may use the site before the launch time: developers, admins (superAdmin), directors, show hosts, beta testers and
// anyone an admin gave `earlyAccess` (users/{uid}.earlyAccess, set at /admin/launch). Everyone else is "locked".

const cache = new Map<string, { at: number; ok: boolean }>()

/** True if this signed-in person may use the site before launch. Cached for a minute per person. */
export async function hasEarlyAccess(t: DecodedIdToken): Promise<boolean> {
  if (isDeveloperToken(t) || t.tester === true) return true
  const now = Date.now()
  const hit = cache.get(t.uid)
  if (hit && now - hit.at < 60_000) return hit.ok
  const u = await adminDb().collection('users').doc(t.uid).get()
  const role = u.get('role')
  let ok = role === 'superAdmin' || role === 'director' || role === 'showHost' || u.get('earlyAccess') === true || u.get('betaTester') === true
  // Hosts still in training need the site before launch to finish it.
  if (!ok) ok = (await adminDb().collection('training').doc(t.uid).get()).exists || (await isTester(t.email))
  if (cache.size > 2000) cache.clear()
  cache.set(t.uid, { at: now, ok })
  return ok
}
export const forgetEarlyAccess = (uid?: string) => { if (uid) cache.delete(uid); else cache.clear() }

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
  throw new HttpError(403, 'Babson Radio opens October 30 at 10 am. Your account is ready.', 'BR-PRE-003')
}
