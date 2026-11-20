import 'server-only'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from './admin'
import { mailConfigured, sendMail, verifyReminderMail } from './mailer'
import { sweepUnverified } from '../unverifiedSweep'

/** Daily: remind unverified (locked) accounts once, around day 10. Nothing is deleted. Runs inside an existing cron. */
export function runUnverifiedSweep(now = Date.now()) {
  const auth = adminAuth(), db = adminDb()
  return sweepUnverified({
    now,
    list: async token => {
      const r = await auth.listUsers(1000, token)
      return {
        next: r.pageToken,
        users: r.users.map(u => ({
          uid: u.uid, email: u.email, emailVerified: u.emailVerified, createdMs: Date.parse(u.metadata.creationTime) || now,
          graceUntil: typeof u.customClaims?.graceUntil === 'number' ? (u.customClaims.graceUntil as number) : null,
        })),
      }
    },
    profile: async uid => {
      const s = await db.collection('users').doc(uid).get()
      return {
        demo: s.get('demo') === true || s.get('preRegistered') === true, // pre-registered (no password yet) accounts wait to be claimed
         level: String(s.get('level') ?? ''), reminded: !!s.get('verifyReminderAt'),
        name: [s.get('firstName'), s.get('lastName')].filter(Boolean).join(' '),
      }
    },
    remind: async u => {
      if (!mailConfigured() || !u.email) return false
      const m = verifyReminderMail()
      return sendMail(u.email, m.subject, m.text, m.html)
    },
    markReminded: uid => db.collection('users').doc(uid).set({ verifyReminderAt: Timestamp.now() }, { merge: true }).then(() => {}),
  })
}
