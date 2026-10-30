import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { NextResponse } from 'next/server'
import { HttpError, handle } from '@/lib/server/http'
import { uidFromUnsubscribeToken } from '@/lib/unsubscribeToken'

export const runtime = 'nodejs'

// One-click unsubscribe from the launch email (and any later marketing email). No login: the link carries a signed token.
//   GET   /api/unsubscribe?t=<token>   the /unsubscribe page calls this.
//   POST  /api/unsubscribe?t=<token>   mail apps call this for the List-Unsubscribe one-click button (RFC 8058).
// Both set users/{uid}.unsubscribed. Account and security email (verification, password reset) is not affected.
async function run(req: Request) {
  return handle(async () => {
    const token = new URL(req.url).searchParams.get('t') ?? ''
    const uid = token ? await uidFromUnsubscribeToken(token) : null
    if (!uid) throw new HttpError(400, 'That link did not work.', 'BR-UNS-001')
    const ref = adminDb().collection('users').doc(uid)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpError(404, 'That link did not work.', 'BR-UNS-001')
    if (snap.get('unsubscribed') !== true) await ref.set({ unsubscribed: true, unsubscribedAt: Timestamp.now() }, { merge: true })
    return { ok: true }
  }, { 'Cache-Control': 'no-store' })
}
// A browser opening the link (Accept: text/html) gets a plain confirmation page; the /unsubscribe page and mail apps get JSON.
const page = (title: string, msg: string, status = 200) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
  `<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 24px;color:#1a1710;line-height:1.5"><h1 style="font-size:20px">${title}</h1><p>${msg}</p>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
export async function GET(req: Request) {
  const res = await run(req)
  if (!(req.headers.get('accept') ?? '').includes('text/html')) return res
  return res.ok
    ? page('You are unsubscribed', 'We will not send you any more Babson Radio emails. Account emails like password resets still come through.')
    : page('That link did not work', 'It may be incomplete. Email us if you still get messages you do not want.', res.status)
}
export const POST = run
