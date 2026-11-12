import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { CONDUCT_VERSION } from '../conduct'
import { evaluateAuto, autoStartsInSameWeek, autoStartsOf, type BlockReason } from '../slotAuto'
import { HttpError } from './http'
import { findConflict } from './slots'

/** The auto-approver decided to leave a request pending. Not an error: the reason is saved on the request so the student can read it. */
export class AutoSkip extends Error {
  constructor(public reason: BlockReason | 'held' | 'not-due') { super(`auto-approval skipped: ${reason}`) }
}

export type ApprovedMail = { to: string; title: string; at: number }

/**
 * The one approval. Staff (Admin > Slots, POST /api/slots/decision) and the auto-approver (lib/server/autoApprove.ts) both run exactly this:
 * the request must still be pending, the on-air agreement signed, the time still in the future and free (findConflict), and then the airSlots
 * booking and the request update are written in one transaction. `by` is 'auto' or the staff uid; it is saved as `approvedBy` on both documents.
 * For 'auto' it also re-checks everything the auto-approver depends on (held, training, the one-auto-show-a-week limit) inside the transaction and
 * throws AutoSkip instead of approving. The caller sends the email (returned in `mail`) and rebuilds the auto schedule.
 */
export async function approveRequest(db: Firestore, requestId: string, o: { by: 'auto' | string; note?: string; connectionInfo?: string; now?: number }): Promise<{ ok: true; mail: ApprovedMail }> {
  const note = o.note ?? '', connectionInfo = o.connectionInfo ?? ''
  const reqRef = db.collection('slotRequests').doc(requestId)
  return db.runTransaction(async tx => {
    const now = o.now ?? Date.now()
    const r = await tx.get(reqRef)
    if (!r.exists) throw new HttpError(404, 'Request not found.')
    if (r.get('status') !== 'pending') throw new HttpError(409, 'This request was already handled.')

    const uid = String(r.get('requesterUid'))
    const signer = await tx.get(db.collection('users').doc(uid))
    const start: Timestamp = r.get('startAt')
    const end: Timestamp = r.get('endAt')
    const auto = o.by === 'auto'
    // Reads first (a transaction may not read after it writes).
    const mine = auto ? await tx.get(db.collection('airSlots').where('requesterUid', '==', uid)) : null
    const conflict = await findConflict(db, start.toDate(), end.toDate(), tx)

    if (auto) {
      const autoStarts = autoStartsOf(mine!.docs.map(d => ({ approvedBy: d.get('approvedBy'), startAt: (d.get('startAt') as Timestamp).toMillis() })))
      const v = evaluateAuto({
        now, status: 'pending', held: r.get('held') === true, autoApproveAt: (r.get('autoApproveAt') as Timestamp | undefined)?.toMillis() ?? null,
        startMs: start.toMillis(), type: String(r.get('type')),
        requester: {
          level: String(signer.get('level') ?? 'student'), conductVersion: signer.get('conductVersion'),
          radioTrained: signer.get('radioTrained') === true, radioExpiresAt: (signer.get('radioExpiresAt') as Timestamp | undefined)?.toMillis?.() ?? null,
        },
        conductVersion: CONDUCT_VERSION, autoStartsInWeek: autoStartsInSameWeek(autoStarts, start.toMillis()), conflict: !!conflict,
      })
      if (v.action === 'wait') throw new AutoSkip('not-due')
      if (v.action === 'skip') throw new AutoSkip(v.reason as BlockReason | 'held')
    } else {
      if (signer.get('conductVersion') !== CONDUCT_VERSION) throw new HttpError(409, 'They have not signed the on-air agreement yet.')
      if (start.toMillis() < now) throw new HttpError(400, 'That time has already passed.')
      if (conflict) throw new HttpError(409, 'That time is now taken by another approved slot.')
    }

    tx.set(db.collection('airSlots').doc(requestId), {
      requestId, requesterUid: r.get('requesterUid'), hostName: r.get('requesterName'),
      title: r.get('title'), type: r.get('type'), category: r.get('category'),
      description: r.get('description') ?? '', imageUrl: r.get('imageUrl') ?? '', imagePath: r.get('imagePath') ?? '',
      startAt: start, endAt: end,
      receiveRatings: r.get('receiveRatings') !== false,
      makePublic: r.get('makePublic') === true, publicConsentId: r.get('publicConsentId') ?? '',
      groupId: r.get('groupId') ?? '', approvedBy: o.by,
    })
    tx.update(reqRef, {
      status: 'approved', staffNote: note, connectionInfo, approvedBy: o.by,
      decidedAt: Timestamp.fromMillis(now), decidedBy: o.by,
      autoApproveAt: FieldValue.delete(), autoBlockedReason: FieldValue.delete(), autoCheckedAt: FieldValue.delete(),
    })
    return { ok: true as const, mail: { to: String(r.get('requesterEmail') ?? ''), title: String(r.get('title') ?? ''), at: start.toMillis() } }
  })
}

/** "Monday, March 2 at 8:00 PM ET", for the decision email. */
export const whenText = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
