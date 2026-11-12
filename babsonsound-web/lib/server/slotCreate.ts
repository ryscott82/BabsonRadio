import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { after } from 'next/server'
import { HttpError } from './http'
import { findConflict } from './slots'
import { readiness } from './conduct'
import { accessOf } from './access'
import { notifyAdmins } from './push'
import { assertAllAdults, recordConsent } from './publicContent'
import { touchesCleanHours } from '../conduct'
import { SLOT_RULES, type SlotCategory, type SlotType } from '../slots'
import { autoApproveAtMs, autoEligible, pendingCount } from '../slotAuto'

export type NewRequest = {
  title: string; description: string; location: string; type: SlotType; category: SlotCategory; audioURL: string
  img: { imageUrl: string; imagePath: string } | null; durationMin: number; receiveRatings: boolean
  /** typed signature for sharing recordings beyond students (first show of a group only; the rest point at the same record) */
  publicConsent?: Record<string, unknown> | null
}
export type Skipped = { startAt: number; reason: 'conflict' | 'too-far' | 'too-soon' | 'already-requested' }

/**
 * Makes one pending request for each start (a group when there are several). Shared by POST /api/slots/request and POST /api/slots/repeat.
 * `starts[0]` is the one the person asked for: with `hardFirst` a conflict there is an error (409); every other week that conflicts, is too
 * soon or too far ahead, or is already requested by this person is skipped and listed. A group counts as one pending request.
 */
export async function createSlotRequests(db: Firestore, t: DecodedIdToken, b: NewRequest, starts: number[], o: { hardFirst: boolean; groupId?: string | null; now?: number }) {
  const now = o.now ?? Date.now()
  const stepMs = b.durationMin * 60_000
  const skipped: Skipped[] = []
  const mine = (await db.collection('slotRequests').where('requesterUid', '==', t.uid).get()).docs
  const taken = new Set(mine.filter(d => d.get('status') === 'pending' || d.get('status') === 'approved').map(d => d.get('startAt').toMillis() as number))

  const ok: number[] = []
  for (const [i, s] of starts.entries()) {
    const first = i === 0 && o.hardFirst
    if (s < now + SLOT_RULES.minLeadHours * 3600_000) { if (first) throw new HttpError(400, `Request at least ${SLOT_RULES.minLeadHours} hours ahead.`); skipped.push({ startAt: s, reason: 'too-soon' }); continue }
    if (s > now + SLOT_RULES.maxAdvanceDays * 86_400_000) { if (first) throw new HttpError(400, `Requests can be up to ${SLOT_RULES.maxAdvanceDays} days ahead.`); skipped.push({ startAt: s, reason: 'too-far' }); continue }
    if (taken.has(s)) { skipped.push({ startAt: s, reason: 'already-requested' }); continue }
    if (await findConflict(db, new Date(s), new Date(s + stepMs))) {
      if (first) throw new HttpError(409, 'That time is already booked. Pick another.')
      skipped.push({ startAt: s, reason: 'conflict' }); continue
    }
    ok.push(s)
  }
  if (!ok.length) throw new HttpError(409, 'Those times are already booked or already requested.')

  // Pre-recorded shows are open to students. Live shows need the radioTrained badge (directors and admins always have it). The on-air agreements are signed
  // right after they submit, so a request is saved first and carries a flag for whether the account has signed yet.
  const ready = await readiness(db, t)
  // A radio badge that ran out blocks NEW live requests until renewed. Shows already approved stay on the schedule.
  if (b.type === 'live' && !ready.trained) {
    if ((await accessOf(t)).radioExpired) throw new HttpError(403, 'Your radio training has ended. Renew it to request a live show.', 'BR-TRN-010')
    throw new HttpError(403, 'Finish radio training to request a live show.', 'BR-TRN-001')
  }

  const groupId = o.groupId || (starts.length > 1 ? db.collection('slotRequests').doc().id : null)
  // A group counts as one pending request: adding to a group that is already pending does not use another.
  const rows = mine.map(d => ({ id: d.id, status: String(d.get('status')), groupId: d.get('groupId') as string | undefined }))
  const joins = !!groupId && rows.some(r => r.status === 'pending' && (r.groupId || r.id) === groupId)
  if (!joins && pendingCount(rows) >= SLOT_RULES.maxPendingPerUser) throw new HttpError(429, `You can have ${SLOT_RULES.maxPendingPerUser} pending requests at a time.`)

  const wantsPublic = b.publicConsent != null && typeof b.publicConsent === 'object'
  if (wantsPublic) await assertAllAdults(db, [t.uid])

  const user = await db.collection('users').doc(t.uid).get()
  const eligible = autoEligible({ type: b.type, conductSigned: ready.conductSigned, radioTrained: ready.trained })
  const created = Timestamp.fromMillis(now)
  const refs = ok.map(() => db.collection('slotRequests').doc())
  const batch = db.batch()
  ok.forEach((s, i) => batch.set(refs[i], {
    requesterUid: t.uid,
    requesterName: user.get('firstName') ?? user.get('displayName') ?? 'Student',
    requesterEmail: t.email ?? '',
    title: b.title, description: b.description, location: b.location, type: b.type, category: b.category, audioURL: b.audioURL,
    imageUrl: b.img?.imageUrl ?? '', imagePath: b.img?.imagePath ?? '',
    startAt: Timestamp.fromMillis(s), endAt: Timestamp.fromMillis(s + stepMs), durationMin: b.durationMin,
    status: 'pending', createdAt: created, makePublic: false, cleanHours: touchesCleanHours(s, s + stepMs), conductSigned: ready.conductSigned, receiveRatings: b.receiveRatings,
    ...(groupId ? { groupId } : {}),
    // Approves itself at this time unless staff hold it, the week limit applies, or the agreement / training is missing (lib/server/autoApprove.ts).
    autoApproveAt: Timestamp.fromMillis(autoApproveAtMs(now, s)), autoEligible: eligible,
  }))
  await batch.commit()

  if (wantsPublic) {
    try {
      const consentId = await recordConsent(db, t, b.publicConsent as Record<string, unknown> as never, { kind: 'slot', id: refs[0].id, title: b.title })
      await Promise.all(refs.map(r => r.update({ makePublic: true, publicConsentId: consentId })))
    } catch (e) { await Promise.all(refs.map(r => r.delete())); throw e } // a bad signature never leaves a half-made request
  }
  const who = user.get('firstName') ?? 'A student'
  after(() => notifyAdmins('requests', { title: 'New show request', body: `${who}: ${b.title}${ok.length > 1 ? ` (${ok.length} weeks)` : ''}` }, t.uid))
  return { id: refs[0].id, ids: refs.map(r => r.id), skipped, groupId, needsAgreement: !ready.conductSigned }
}
