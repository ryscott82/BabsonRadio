import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'

/** One thing on the admin Notifications card. Built fresh from live data each time; only the dismissals are stored. */
export type Notice = {
  key: string
  kind: 'deadair' | 'monitor' | 'request' | 'report' | 'cancel'
  title: string
  /** Extra lines shown when the row is opened. */
  detail: string[]
  at: number
  href?: string
  hrefLabel?: string
  /** Cancellations only: the fields the phone app reads. */
  cancel?: { id: string; title: string; requesterName: string; startAt: number; cancelledAt: number; reason: string; wasApproved: boolean }
}

const clip = (s: unknown, n: number) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const dayTime = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

/** Everything that currently needs attention for this person. Directors get requests, cancellations and dead air; admins also get reports. */
export async function buildNotices(db: Firestore, admin: boolean): Promise<Notice[]> {
  const now = Date.now()
  const out: Notice[] = []

  const da = await db.collection('ops').doc('deadair').get()
  const lastSeen = da.get('lastSeen')?.toMillis?.() ?? 0
  const since = da.get('since')?.toMillis?.() ?? 0
  if (da.get('active') === true) {
    out.push({ key: `deadair-${since}`, kind: 'deadair', title: 'Dead air', at: since,
      detail: [`Silent since ${dayTime(since)}.`, clip(da.get('detail'), 300)].filter(Boolean) })
  }
  if (!lastSeen || now - lastSeen > 300_000) {
    out.push({ key: `monitor-${lastSeen}`, kind: 'monitor', title: 'Dead-air monitor is silent', at: lastSeen || now,
      detail: [lastSeen ? `Last check-in ${dayTime(lastSeen)}.` : 'It has never checked in.', 'Check the streaming PC.'] })
  }

  const pending = await db.collection('slotRequests').where('status', '==', 'pending').get()
  for (const d of pending.docs.slice(0, 40)) {
    const startAt = d.get('startAt')?.toMillis?.() ?? 0
    out.push({
      key: `req-${d.id}`, kind: 'request', title: `Show request: ${clip(d.get('title'), 80)}`, at: d.get('createdAt')?.toMillis?.() ?? startAt,
      detail: [
        `From ${d.get('requesterName') || 'a student'}${d.get('requesterEmail') ? ` (${d.get('requesterEmail')})` : ''}.`,
        startAt ? `Wants ${dayTime(startAt)}${d.get('durationMin') ? `, ${d.get('durationMin')} min` : ''}.` : '',
        clip(d.get('description'), 400),
      ].filter(Boolean),
      href: '/admin/slots', hrefLabel: 'Review',
    })
  }

  const cutoff = now - 14 * 86_400_000
  const cancelled = await db.collection('slotRequests').where('status', '==', 'cancelled').get()
  cancelled.docs
    .filter(d => (d.get('cancelledAt')?.toMillis?.() ?? 0) > cutoff)
    .sort((a, b) => b.get('cancelledAt').toMillis() - a.get('cancelledAt').toMillis())
    .slice(0, 20)
    .forEach(d => {
      const startAt = d.get('startAt')?.toMillis?.() ?? 0
      out.push({
        key: `cancel-${d.id}`, kind: 'cancel', title: `Cancelled: ${clip(d.get('title'), 80)}`, at: d.get('cancelledAt').toMillis(),
        detail: [
          `${d.get('requesterName') || 'A student'} cancelled the show planned for ${startAt ? dayTime(startAt) : 'a past date'}${d.get('cancelledFrom') === 'approved' ? ' (it had been approved)' : ''}.`,
          d.get('cancelReason') ? `Reason: ${clip(d.get('cancelReason'), 300)}` : '',
        ].filter(Boolean),
        cancel: { id: d.id, title: d.get('title'), requesterName: d.get('requesterName') ?? '', startAt, cancelledAt: d.get('cancelledAt').toMillis(), reason: d.get('cancelReason') ?? '', wasApproved: d.get('cancelledFrom') === 'approved' },
      })
    })

  if (admin) {
    const reports = await db.collection('feedback').where('status', '==', 'new').get()
    for (const d of reports.docs.slice(0, 40)) {
      out.push({
        key: `report-${d.id}`, kind: 'report', title: `${d.get('type') === 'feature' ? 'Idea' : 'Bug report'}: ${clip(d.get('message'), 70)}`,
        at: d.get('createdAt')?.toMillis?.() ?? 0,
        detail: [clip(d.get('message'), 600), `From ${d.get('name') || 'someone'}${d.get('email') ? ` (${d.get('email')})` : ''} on ${d.get('platform') === 'ios' ? 'the iPhone app' : 'the website'}${d.get('page') ? `, page ${d.get('page')}` : ''}.`],
        href: '/admin/feedback', hrefLabel: 'Open',
      })
    }
  }
  return out
}

const logRef = (db: Firestore) => db.collection('noticeLog')

/** Keys of notices that are currently dismissed (and not restored). */
export async function dismissedKeys(db: Firestore, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set()
  const docs = await db.getAll(...keys.map(k => logRef(db).doc(k)))
  return new Set(docs.filter(d => d.exists && !d.get('restoredAt')).map(d => d.id))
}

export async function dismissNotices(db: Firestore, items: Notice[], by: { uid: string; name: string }): Promise<number> {
  if (!items.length) return 0
  const batch = db.batch()
  for (const n of items) {
    batch.set(logRef(db).doc(n.key), {
      key: n.key, kind: n.kind, title: n.title, detail: n.detail, at: n.at, href: n.href ?? '',
      dismissedAt: Timestamp.now(), dismissedBy: by.uid, dismissedByName: by.name, restoredAt: FieldValue.delete(),
    })
  }
  await batch.commit()
  return items.length
}

export async function restoreNotice(db: Firestore, key: string): Promise<void> {
  const ref = logRef(db).doc(key)
  if ((await ref.get()).exists) await ref.update({ restoredAt: Timestamp.now() })
}

export type LogEntry = { key: string; kind: Notice['kind']; title: string; detail: string[]; at: number; href: string; dismissedAt: number; dismissedByName: string; restored: boolean }

export async function readLog(db: Firestore): Promise<LogEntry[]> {
  const snap = await logRef(db).orderBy('dismissedAt', 'desc').limit(150).get()
  return snap.docs.map(d => ({
    key: d.id, kind: d.get('kind'), title: d.get('title') ?? '', detail: d.get('detail') ?? [], at: d.get('at') ?? 0, href: d.get('href') ?? '',
    dismissedAt: d.get('dismissedAt')?.toMillis?.() ?? 0, dismissedByName: d.get('dismissedByName') ?? '', restored: !!d.get('restoredAt'),
  }))
}
