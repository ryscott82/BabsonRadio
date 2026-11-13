import 'server-only'
import { adminAuth, adminDb } from './admin'
import { HttpError, requireUser, str } from './http'
import { boothSecret } from './booth'
import { requireStudioBadge } from './studioBook'
import { readToken, verifyAttest, RECORDING_TOKEN_MAX_AGE_MS } from '../booth'
import { pcRecorderProblem } from '../recordingsCore'

/**
 * Who a "Record a show" call is for. Two ways in:
 *  - the studio PC itself (x-booth-nonce / x-booth-sig headers signed with STUDIO_PC_SECRET) with the person's control token in the body.
 *    The PC keeps a finished recording and retries until this site answers, so the person may have signed out long ago.
 *  - the person, signed in, with the Studio badge (the old way; still works).
 */
export async function recordingCaller(req: Request, b: Record<string, unknown>, now = Date.now(), live = false): Promise<{ uid: string; email: string; viaPc: boolean }> {
  const nonce = req.headers.get('x-booth-nonce') ?? '', sig = req.headers.get('x-booth-sig') ?? ''
  if (nonce || sig) {
    const secret = boothSecret()
    if (!verifyAttest(secret, nonce.slice(0, 100), sig.slice(0, 100), now)) throw new HttpError(403, 'Open this page on the studio PC.', 'BR-BTH-001')
    const c = readToken(secret, str(b.token, 3000))
    const bad = pcRecorderProblem(c, now, RECORDING_TOKEN_MAX_AGE_MS, live)
    if (bad) throw new HttpError(bad.status, bad.message, bad.code)
    const uid = c!.u
    const u = await adminDb().collection('users').doc(uid).get()
    let email = String(u.get('email') ?? '')
    if (!email) email = (await adminAuth().getUser(uid).catch(() => null))?.email ?? ''
    return { uid, email, viaPc: true }
  }
  const t = await requireUser(req)
  await requireStudioBadge(t)
  return { uid: t.uid, email: t.email ?? '', viaPc: false }
}
