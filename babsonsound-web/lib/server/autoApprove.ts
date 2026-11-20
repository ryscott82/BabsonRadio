import 'server-only'
import { FieldValue, Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { rebuildAutoSchedule } from './autoschedule'
import { sendMail, slotDecisionMail, trainingLapsedMail } from './mailer'
import { releaseImage } from './slots'
import { radioTrainedFromProfile } from '../slotAuto'
import { AutoSkip, approveRequest, whenText, type ApprovedMail } from './slotApproval'

// The auto-approver. A pending request carries `autoApproveAt` (24 h after it was made, or 12 h before the show if that is sooner).
// Once that time passes and nothing stops it, it runs the SAME approval as staff (approveRequest) with by = 'auto'.
// There is no cron of its own (Vercel Hobby allows two and both are used). It runs from:
//   - the two daily crons (autoschedule 09:00 UTC, birthdays 12:00 UTC)
//   - the studio PC's 15-minute schedule check (POST /api/worker/reconcile)
//   - the now-playing route, at most once every 5 minutes per server, whenever anyone has the site open (autoApproveTick)
//   - GET /api/cron/slots-auto with the CRON_SECRET bearer, for a free outside pinger (every 15 minutes)
//   - lazily: POST /api/slots/auto-run (Admin > Slots loads), GET /api/slots/mine (a student opens My shows), GET /api/admin/slot-requests

export type AutoRun = { checked: number; approved: number; blocked: number; failed: number }
const MAX_APPROVALS = 10, MAX_CHECKS = 30, RECHECK_MS = 30 * 60_000

const ms = (v: unknown) => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null

/** Requests whose auto-approval time has come. Pass `candidates` when the caller already read the documents (My shows does). */
export function dueRequests(docs: QueryDocumentSnapshot[], now: number, uid?: string) {
  return docs
    .filter(d => d.get('status') === 'pending' && d.get('held') !== true && (ms(d.get('autoApproveAt')) ?? Infinity) <= now && (!uid || d.get('requesterUid') === uid))
    .sort((a, b) => (ms(a.get('createdAt')) ?? 0) - (ms(b.get('createdAt')) ?? 0))
}

export async function runAutoApprove(db: Firestore, o: { now?: number; uid?: string; candidates?: QueryDocumentSnapshot[]; force?: boolean } = {}): Promise<AutoRun> {
  const now = o.now ?? Date.now()
  const docs = o.candidates ?? (await db.collection('slotRequests').where('autoApproveAt', '<=', Timestamp.fromMillis(now)).limit(60).get()).docs
  await cancelUntrained(db, now).catch(e => console.error('[cancel untrained]', e))
  const out: AutoRun = { checked: 0, approved: 0, blocked: 0, failed: 0 }
  const mails: ApprovedMail[] = []
  for (const d of dueRequests(docs, now, o.uid)) {
    // A request that is stuck (week limit, training, ...) is looked at again every 30 minutes, not on every run.
    const checkedAt = ms(d.get('autoCheckedAt'))
    if (!o.force && d.get('autoBlockedReason') && checkedAt && now - checkedAt < RECHECK_MS) continue
    if (out.checked >= MAX_CHECKS || out.approved >= MAX_APPROVALS) break
    out.checked++
    try {
      mails.push((await approveRequest(db, d.id, { by: 'auto', now })).mail)
      out.approved++
    } catch (e) {
      if (e instanceof AutoSkip) {
        out.blocked++
        if (e.reason !== 'held' && e.reason !== 'not-due') {
          const eligible = !['agreement', 'training', 'ineligible'].includes(e.reason)
          await d.ref.update({ autoBlockedReason: e.reason, autoEligible: eligible, autoCheckedAt: Timestamp.fromMillis(now) }).catch(() => {})
        }
      } else if (e instanceof HttpError && (e.status === 409 || e.status === 404)) {
        // Another server (or staff) handled it first: nothing to do.
      } else { out.failed++; console.error('[auto approve]', d.id, e) }
    }
  }
  if (out.approved) {
    await Promise.all(mails.filter(m => m.to).map(m => {
      const mail = slotDecisionMail({ approved: true, title: m.title, when: whenText(m.at), note: '', connectionInfo: '' })
      return sendMail(m.to, mail.subject, mail.text, mail.html).catch(() => false)
    }))
    await rebuildAutoSchedule(db).catch(e => console.error('[autoschedule]', e))
  }
  return out
}

/**
 * Cancels pending requests whose person was told to take the training within 48 hours and has not (trainByAt has passed). Cheap: one query on trainByAt,
 * and it runs with the auto-approver, so it needs no cron of its own.
 */
export async function cancelUntrained(db: Firestore, now = Date.now()): Promise<number> {
  const snap = await db.collection('slotRequests').where('trainByAt', '<=', Timestamp.fromMillis(now)).limit(20).get()
  let n = 0
  for (const d of snap.docs) {
    if (d.get('status') !== 'pending') { await d.ref.update({ trainByAt: FieldValue.delete() }).catch(() => {}); continue }
    const u = await db.collection('users').doc(String(d.get('requesterUid'))).get()
    const trained = radioTrainedFromProfile({
      level: String(u.get('level') ?? 'student'), radioTrained: u.get('radioTrained') === true, radioExpiresAt: ms(u.get('radioExpiresAt')),
    }, now)
    if (trained) { await d.ref.update({ trainByAt: FieldValue.delete() }).catch(() => {}); continue }
    try {
      await d.ref.update({
        status: 'cancelled', cancelledAt: Timestamp.fromMillis(now), cancelReason: 'Training not taken within 48 hours', cancelledFrom: 'pending',
        trainByAt: FieldValue.delete(), autoApproveAt: FieldValue.delete(), autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete(),
      })
      n++
      await releaseImage(db, d.get('imagePath'), d.id).catch(() => {})
      const to = String(d.get('requesterEmail') ?? '')
      if (to) { const m = trainingLapsedMail(String(d.get('title') ?? 'your show')); await sendMail(to, m.subject, m.text, m.html).catch(() => false) }
    } catch (e) { console.error('[training lapsed]', d.id, e) }
  }
  return n
}

/** Clears the stuck markers when staff or the student change something that could free the request (hold released, agreement signed). */
export const clearBlock = { autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete() }

let lastTick = 0
/** Cheap enough to call on every now-playing run: at most one real check every 5 minutes per server. */
export async function autoApproveTick(db: Firestore, now = Date.now()) {
  if (now - lastTick < 5 * 60_000) return
  lastTick = now
  await runAutoApprove(db, { now }).catch(e => { lastTick = 0; console.error('[auto approve tick]', e) })
}
