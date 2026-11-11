import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { after } from 'next/server'
import { notifyAdmins } from '@/lib/server/push'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { FEEDBACK_PER_HOUR, cleanTarget, cleanType, minMessage, pushTitle } from '@/lib/feedbackInput'

export const runtime = 'nodejs'

// Bug reports, feature ideas and reports of content or a person, from the website and the iOS app. Staff read them at /admin/feedback
// (a notification goes to staff who turned on "reports", and the open ones show on the Admin home and in notices).
// Body: { type: 'bug' | 'feature' | 'report', message, platform?, appVersion?, page?, target?: { kind: 'content' | 'person' | 'other', id?, label? } }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const type = cleanType(b.type)
    const message = str(b.message, 2000)
    if (message.length < minMessage(type)) throw new HttpError(400, 'Tell us a little more so we can help.')
    const target = type === 'report' ? cleanTarget(b.target) : undefined

    const db = adminDb()
    // At most 5 reports an hour per person (no index needed: filter in memory). Reports, bugs and ideas share the count.
    const mine = await db.collection('feedback').where('uid', '==', t.uid).limit(30).get()
    const hourAgo = Date.now() - 3600_000
    if (mine.docs.filter(d => d.get('createdAt').toMillis() > hourAgo).length >= FEEDBACK_PER_HOUR) {
      throw new HttpError(429, 'You have sent a few reports already. Try again in an hour.')
    }

    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('feedback').add({
      uid: t.uid, email: t.email ?? '', name: u.get('firstName') ?? u.get('displayName') ?? '',
      type, message, ...(target ? { target } : {}),
      platform: b.platform === 'ios' ? 'ios' : 'web',
      appVersion: str(b.appVersion, 40), page: str(b.page, 200),
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
      status: 'new', createdAt: Timestamp.now(),
    })
    const who = u.get('firstName') ?? u.get('displayName') ?? 'Someone'
    after(() => notifyAdmins('reports', { title: pushTitle(type, target), body: `${who}: ${target?.label ? `${target.label}: ` : ''}${message}` }, t.uid))
    return { ok: true }
  })
}
