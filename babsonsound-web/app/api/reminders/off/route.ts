import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { uidFromReminderOffToken } from '@/lib/unsubscribeToken'
import { readPrefs } from '@/lib/reminders'

export const runtime = 'nodejs'

// The one-tap link in every reminder email. No login: the link carries a signed token. Turns off show reminders (email and push); the person can turn them back on in settings.
//   GET  /api/reminders/off?t=<token>   a browser gets a plain confirmation page, anything else gets JSON.
//   POST /api/reminders/off?t=<token>   the mail app's one-click unsubscribe button (RFC 8058).
async function run(req: Request) {
  return handle(async () => {
    const token = new URL(req.url).searchParams.get('t') ?? ''
    const uid = token ? await uidFromReminderOffToken(token) : null
    if (!uid) throw new HttpError(400, 'That link did not work.', 'BR-REM-002')
    const ref = adminDb().collection('users').doc(uid)
    const snap = await ref.get()
    if (!snap.exists) throw new HttpError(404, 'That link did not work.', 'BR-REM-002')
    await ref.set({ showReminders: { ...readPrefs(snap.get('showReminders')), email: false, push: false } }, { merge: true })
    return { ok: true }
  }, { 'Cache-Control': 'no-store' })
}
const page = (title: string, msg: string, status = 200) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
  `<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 24px;color:#1a1710;line-height:1.5"><h1 style="font-size:20px">${title}</h1><p>${msg}</p>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
export async function GET(req: Request) {
  const res = await run(req)
  if (!(req.headers.get('accept') ?? '').includes('text/html')) return res
  return res.ok
    ? page('Show reminders are off', 'We will not send you show or studio booking reminders. You can turn them back on in your settings.')
    : page('That link did not work', 'It may be incomplete. Open your settings to change your reminders.', res.status)
}
export const POST = run
