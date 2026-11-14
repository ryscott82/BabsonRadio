import 'server-only'
import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { adminAuth } from './admin'
import { localParts, occursOn, parseClock, type Repeat } from '../autoschedule'
import { loadConfig } from './autoschedule'
import { localDate, localToUtc } from './tz'
import { sendMail, showReminderMail } from './mailer'
import { notifyUserDevices } from './push'
import { reminderOffToken } from '../unsubscribeToken'
import { DEFAULT_PREFS, REMINDER_HORIZON_MS, dueReminders, logIdsFor, readPrefs, reminderText, type Due, type LogMap, type Occurrence, type ReminderPrefs } from '../reminders'

// Show reminders for hosts. Called by an outside pinger (cron-job.org) through /api/cron/reminders, never from a Vercel cron.
// Reads, per call: schedule (active weekly shows), airSlots and studioBookings starting in the next 40 hours (two indexed single-field ranges),
// then only for shows that have a host: the hosts' user docs (3 fields) and their reminder log docs (1 field). Nothing is read when nothing is coming up.

const MAX_PER_CALL = 60
const sentMemo = new Set<string>() // ids this server instance already claimed: skips re-reading their log docs on the next call
let weeklyMemo: { at: number; docs: QueryDocumentSnapshot[] } | null = null // the weekly schedule changes rarely: reused for 10 minutes on a warm server instance
const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : Number(v) || 0)

/** Everything with a host starting in the next 40 hours: one-off shows, weekly shows (next airing) and studio bookings. */
export async function loadOccurrences(db: Firestore, now: number): Promise<Occurrence[]> {
  const from = Timestamp.fromMillis(now), to = Timestamp.fromMillis(now + REMINDER_HORIZON_MS)
  const [slots, books, weekly, cfg] = await Promise.all([
    db.collection('airSlots').where('startAt', '>', from).where('startAt', '<=', to).get(),
    db.collection('studioBookings').where('startAt', '>', from).where('startAt', '<=', to).get(),
    weeklyMemo && now - weeklyMemo.at < 600_000 ? Promise.resolve(weeklyMemo.docs) : db.collection('schedule').where('isActive', '==', true).get().then(r => (weeklyMemo = { at: now, docs: r.docs }).docs),
    loadConfig(db),
  ])
  const out: Occurrence[] = []
  for (const d of slots.docs) {
    const uid = String(d.get('requesterUid') ?? '')
    if (!uid || d.get('status') === 'cancelled') continue
    out.push({ key: `slot-${d.id}`, kind: 'slot', title: String(d.get('title') ?? 'Your show'), startAt: ms(d.get('startAt')), hostUids: [uid], studio: d.get('type') !== 'prerecorded' })
  }
  for (const d of books.docs) {
    if (d.get('status') !== 'booked') continue
    const uid = String(d.get('uid') ?? '')
    if (uid) out.push({ key: `booking-${d.id}`, kind: 'booking', title: 'Studio booking', startAt: ms(d.get('startAt')), hostUids: [uid], studio: true })
  }
  const tz = cfg.timezone
  for (let off = 0; off <= 2; off++) {
    const probe = now + off * 86_400_000
    const [y, m, dd] = localDate(probe, tz)
    const dow = localParts(probe, tz).dow
    for (const w of weekly) {
      const hosts = Array.isArray(w.get('hostUids')) ? (w.get('hostUids') as unknown[]).map(String).filter(Boolean) : []
      if (!hosts.length) continue
      if (!occursOn({ dayOfWeek: w.get('dayOfWeek'), repeat: w.get('repeat'), anchor: w.get('anchor'), weeks: w.get('weeks'), dates: w.get('dates') } as Repeat & { dayOfWeek?: number }, dow, y, m, dd)) continue
      const s = parseClock(String(w.get('startTime') ?? ''))
      if (s === null) continue
      const startAt = localToUtc(y, m, dd, s, tz)
      if (startAt <= now || startAt > now + REMINDER_HORIZON_MS) continue
      out.push({ key: `weekly-${w.id}-${startAt}`, kind: 'weekly', title: String(w.get('showName') ?? 'Your show'), startAt, hostUids: hosts, studio: true })
    }
  }
  return out
}

export interface ReminderRun { checked: number; due: Due[]; sent: { id: string; email: boolean; push: number }[]; skipped: number }

/** Works out what is due and (unless dry) sends it. Each reminder is claimed in the log first, so overlapping or repeated calls never send it twice. */
export async function runReminders(db: Firestore, o: { now?: number; dry?: boolean } = {}): Promise<ReminderRun> {
  const now = o.now ?? Date.now()
  const occ = await loadOccurrences(db, now)
  if (!occ.length) return { checked: 0, due: [], sent: [], skipped: 0 }

  const uids = [...new Set(occ.flatMap(x => x.hostUids))]
  const userSnaps = await db.getAll(...uids.map(u => db.collection('users').doc(u)), { fieldMask: ['email', 'showReminders', 'unsubscribed'] })
  const prefs: Record<string, ReminderPrefs> = {}, emails: Record<string, string> = {}, canEmail: Record<string, boolean> = {}
  for (const u of userSnaps) {
    if (!u.exists) continue
    prefs[u.id] = readPrefs(u.get('showReminders') ?? DEFAULT_PREFS)
    emails[u.id] = String(u.get('email') ?? '')
    canEmail[u.id] = u.get('unsubscribed') !== true
  }

  const ids = [...new Set(occ.flatMap(x => x.hostUids.filter(u => prefs[u]).flatMap(u => logIdsFor(x, u))))].filter(id => !sentMemo.has(id))
  const logs: LogMap = {}
  if (ids.length) for (const s of await db.getAll(...ids.map(id => db.collection('reminderLog').doc(id)), { fieldMask: ['startAt'] })) if (s.exists) logs[s.id] = { startAt: Number(s.get('startAt')) }
  const due = dueReminders(occ, logs, prefs, Object.fromEntries(uids.map(u => [u, canEmail[u] === true])), now)
  if (o.dry) return { checked: occ.length, due, sent: [], skipped: 0 }

  const sent: ReminderRun['sent'] = []
  let skipped = 0
  for (const d of due.slice(0, MAX_PER_CALL)) {
    const ref = db.collection('reminderLog').doc(d.id)
    // Claim before sending: a retry or a second caller sees the log and stops. A log for an older start time (the show moved) is replaced.
    const won = await db.runTransaction(async tx => {
      const s = await tx.get(ref)
      if (s.exists && Number(s.get('startAt')) === d.startAt) return false
      tx.set(ref, { key: d.key, kind: d.kind, uid: d.uid, startAt: d.startAt, claimedAt: now, expiresAt: Timestamp.fromMillis(d.startAt + 7 * 86_400_000) })
      return true
    })
    sentMemo.add(d.id)
    if (sentMemo.size > 5000) sentMemo.clear()
    if (!won) { skipped++; continue }
    const text = reminderText(d)
    let mailed = false, pushed = 0
    if (d.email) {
      let to = emails[d.uid]
      if (!to) to = (await adminAuth().getUser(d.uid).catch(() => null))?.email ?? ''
      if (to) {
        const tok = await reminderOffToken(d.uid)
        const offUrl = tok ? `https://babsonradio.com/api/reminders/off?t=${encodeURIComponent(tok)}` : 'https://babsonradio.com/profile'
        const m = showReminderMail({ lead: text.lead, place: text.place, offUrl, whatsapp: process.env.SUPPORT_WHATSAPP_URL || '' })
        mailed = await sendMail(to, text.subject, m.text, m.html, tok ? { unsubscribeUrl: offUrl } : {})
      }
    }
    if (d.push) pushed = await notifyUserDevices(d.uid, text.push)
    await ref.update({ email: mailed, push: pushed }).catch(() => {})
    sent.push({ id: d.id, email: mailed, push: pushed })
  }
  return { checked: occ.length, due, sent, skipped }
}
