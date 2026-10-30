import 'server-only'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { mailConfigured, sendMail, trainingExpiryMail } from './mailer'
import { notifyUsers } from './push'
import { ms } from './studio'
import { BADGES, noticeDue, type Badge, type NoticeKind } from '../studioRules'

const DAY = 86_400_000
const MAX_PER_RUN = 50

/**
 * Daily, inside the existing morning cron: tell people whose Studio / Radio badge ends soon (14 days before, and again May 1 to 3).
 * Two small range queries find them. Each notice is claimed with one write (trainingNotices/{uid}_{badge}_{expiry}_{kind}) before
 * it is sent, so a rerun never sends it twice. The in-app banner comes from /api/me (studio/radio ExpiresAt), so it needs no storage.
 */
export async function runStudioExpiryNotices(now = Date.now()): Promise<{ checked: number; notified: number }> {
  const db = adminDb()
  const due = new Map<string, { email: string; items: { badge: Badge; expiresAt: number; kind: NoticeKind }[] }>()
  let checked = 0
  for (const badge of BADGES) {
    const snap = await db.collection('users')
      .where(`${badge}ExpiresAt`, '>', Timestamp.fromMillis(now)).where(`${badge}ExpiresAt`, '<', Timestamp.fromMillis(now + 62 * DAY)).limit(500).get()
    for (const u of snap.docs) {
      checked++
      if (u.get('level') !== 'student' || u.get(`${badge}Trained`) !== true || !u.get('email')) continue
      const expiresAt = ms(u.get(`${badge}ExpiresAt`)) as number
      const refs = (['d14', 'may1'] as const).map(k => db.collection('trainingNotices').doc(`${u.id}_${badge}_${expiresAt}_${k}`))
      const sent = new Set((await db.getAll(...refs)).flatMap((d, i) => (d.exists ? [['d14', 'may1'][i]] : [])))
      const kind = noticeDue(expiresAt, now, sent)
      if (!kind) continue
      const e = due.get(u.id) ?? { email: String(u.get('email')), items: [] }
      e.items.push({ badge, expiresAt, kind })
      due.set(u.id, e)
    }
  }
  let notified = 0
  for (const [uid, e] of [...due].slice(0, MAX_PER_RUN)) {
    const claimed: { id: string; badge: Badge }[] = []
    for (const it of e.items) {
      const id = `${uid}_${it.badge}_${it.expiresAt}_${it.kind}`
      try { await db.collection('trainingNotices').doc(id).create({ uid, badge: it.badge, kind: it.kind, expiresAt: Timestamp.fromMillis(it.expiresAt), at: Timestamp.fromMillis(now) }); claimed.push({ id, badge: it.badge }) } catch { /* someone else sent it */ }
    }
    if (!claimed.length) continue
    const mine = e.items.filter(it => claimed.some(c => c.badge === it.badge))
    const first = mine.reduce((a, b) => (a.expiresAt <= b.expiresAt ? a : b))
    const mail = trainingExpiryMail({ badges: mine.map(i => i.badge), expiresAt: first.expiresAt, kind: first.kind })
    const emailed = mailConfigured() ? await sendMail(e.email, mail.subject, mail.text, mail.html) : true
    if (!emailed) { await Promise.all(claimed.map(c => db.collection('trainingNotices').doc(c.id).delete())); continue } // try again tomorrow
    await notifyUsers('announcements', [uid], { title: mail.subject, body: 'Come to a training session to renew. Approved shows stay on the schedule.' })
    notified++
  }
  return { checked, notified }
}
