import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { notifyAdmins } from '@/lib/server/push'
import { mailConfigured, sendMail } from '@/lib/server/mailer'

export const runtime = 'nodejs'

// The dead-air monitor (tools/deadair_monitor.py, run on the always-on streaming PC) reports here every minute.
//   POST { state: 'ok' | 'silent' | 'down', seconds?, detail? }  with header  x-monitor-key: <MONITOR_SECRET or CRON_SECRET>
// A change from ok to silent/down alerts admins by push and email. Repeats every 15 minutes while it lasts. Recovery is announced once.
const REALERT_MS = 15 * 60_000

export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.MONITOR_SECRET || process.env.CRON_SECRET
    if (!secret || req.headers.get('x-monitor-key') !== secret) throw new HttpError(401, 'Not allowed.')
    const b = await readJson(req)
    const state = str(b.state, 10)
    if (!['ok', 'silent', 'down'].includes(state)) throw new HttpError(400, 'Unknown state.')
    const detail = str(b.detail, 200)
    const seconds = Math.max(0, Math.round(Number(b.seconds) || 0))

    const db = adminDb()
    const ref = db.collection('ops').doc('deadair')
    const prev = await ref.get()
    const wasActive = prev.get('active') === true
    const now = Date.now()
    const base = { lastSeen: Timestamp.fromMillis(now), state, detail }

    if (state === 'ok') {
      await ref.set({ ...base, active: false }, { merge: true })
      if (wasActive) after(() => alertAdmins('Back on air', 'The stream is playing sound again.'))
      return { ok: true }
    }
    const lastAlert = prev.get('lastAlertAt')?.toMillis?.() ?? 0
    const alertNow = !wasActive || now - lastAlert > REALERT_MS
    await ref.set({ ...base, active: true, since: wasActive ? prev.get('since') : Timestamp.fromMillis(now), ...(alertNow ? { lastAlertAt: Timestamp.fromMillis(now) } : {}) }, { merge: true })
    if (alertNow) {
      const what = state === 'down' ? 'The stream is not reachable.' : `The stream has been silent${seconds ? ` for ${seconds} seconds` : ''}.`
      after(() => alertAdmins('DEAD AIR', `${what}${detail ? ` ${detail}` : ''}`))
    }
    return { ok: true, alerted: alertNow }
  })
}

async function alertAdmins(title: string, body: string) {
  await notifyAdmins('ops', { title, body })
  if (!mailConfigured()) return
  try {
    const admins = await adminDb().collection('users').where('role', '==', 'superAdmin').get()
    await Promise.all(admins.docs.map(d => String(d.get('email') ?? '')).filter(Boolean).map(e =>
      sendMail(e, `Babson Radio: ${title}`, body, `<p>${body}</p><p>Check the station at https://babsonradio.com/admin</p>`)))
  } catch (e) { console.error('[deadair mail]', e) }
}
