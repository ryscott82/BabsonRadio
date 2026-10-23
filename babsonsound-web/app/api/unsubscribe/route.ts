import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { uidFromUnsubscribeToken } from '@/lib/launchLock'

export const runtime = 'nodejs'

// One-click unsubscribe from the launch email (and any later marketing email). No login: the link carries a signed token.
//   GET   /api/unsubscribe?t=<token>   the /unsubscribe page calls this.
//   POST  /api/unsubscribe?t=<token>   mail apps call this for the List-Unsubscribe one-click button (RFC 8058).
// Both set users/{uid}.emailOptOut. Account and security email (verification, password reset) is not affected.
async function run(req: Request) {
  return handle(async () => {
    const token = new URL(req.url).searchParams.get('t') ?? ''
    const uid = token ? await uidFromUnsubscribeToken(token) : null
    if (!uid) throw new HttpError(400, 'That link did not work.', 'BR-UNS-001')
    const ref = adminDb().collection('users').doc(uid)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpError(404, 'That link did not work.', 'BR-UNS-001')
    if (snap.get('emailOptOut') !== true) await ref.set({ emailOptOut: true, emailOptOutAt: Timestamp.now() }, { merge: true })
    return { ok: true }
  }, { 'Cache-Control': 'no-store' })
}
export const GET = run
export const POST = run
