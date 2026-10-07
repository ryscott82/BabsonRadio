import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'

export const runtime = 'nodejs'

// Bug reports and feature ideas from the website and the iOS app. Staff read them at /admin/feedback.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const type = b.type === 'feature' ? 'feature' : 'bug'
    const message = str(b.message, 2000)
    if (message.length < 5) throw new HttpError(400, 'Tell us a little more so we can help.')

    const db = adminDb()
    // At most 5 reports an hour per person (no index needed: filter in memory).
    const mine = await db.collection('feedback').where('uid', '==', t.uid).limit(30).get()
    const hourAgo = Date.now() - 3600_000
    if (mine.docs.filter(d => d.get('createdAt').toMillis() > hourAgo).length >= 5) {
      throw new HttpError(429, 'You have sent a few reports already. Try again in an hour.')
    }

    const u = await db.collection('users').doc(t.uid).get()
    await db.collection('feedback').add({
      uid: t.uid, email: t.email ?? '', name: u.get('firstName') ?? u.get('displayName') ?? '',
      type, message,
      platform: b.platform === 'ios' ? 'ios' : 'web',
      appVersion: str(b.appVersion, 40), page: str(b.page, 200),
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
      status: 'new', createdAt: Timestamp.now(),
    })
    return { ok: true }
  })
}
