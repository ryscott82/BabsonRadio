import 'server-only'
import { adminAppCheck } from './admin'
import { HttpError } from './http'

// Firebase App Check with App Attest proves a request comes from the real Babson Radio iOS app on a real device.
// The app sends the token in the X-Firebase-AppCheck header. The site (browser) does not use it; it gets Turnstile instead.
//   APPCHECK_ENFORCE=1  makes the contacts routes refuse requests without a valid token. Leave it off until the app build
//                       that sends tokens is live, then switch it on (no redeploy of code needed, only the env var).
export const HEADER = 'x-firebase-appcheck'

/** True when the request carries a valid App Check token. */
export async function hasValidAppCheck(req: Request): Promise<boolean> {
  const token = req.headers.get(HEADER)
  if (!token) return false
  try { await adminAppCheck().verifyToken(token); return true } catch { return false }
}

/** For the contacts routes: with APPCHECK_ENFORCE=1 a missing or bad token is refused. */
export async function requireAppCheck(req: Request) {
  if (process.env.APPCHECK_ENFORCE !== '1') return
  if (!(await hasValidAppCheck(req))) throw new HttpError(403, 'Open Babson Radio from the app and try again.', 'BR-ACC-024')
}
