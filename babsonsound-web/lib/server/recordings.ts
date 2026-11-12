import 'server-only'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { HttpError } from './http'
import { cleanPath, attachProblem } from '../recordingsCore'
export { cleanPath, attachProblem }
import { az, azuraConfigured, blockToItems, station } from './azuracast'
import { azDeleteMedia, azFindMedia, azSetPlaylists } from './azuraMedia'
import { loadConfig } from './autoschedule'

// Student recordings (collection `recordings`, admin SDK only). The studio PC uploads the file straight to AzuraCast with its own AzuraCast key; this
// site only keeps the details: { uid, bookingId?, requestId?, title, azuracastPath, durationSec, status, createdAt }.
// status: recording -> uploading -> uploaded -> attached (to a pre-recorded show request) -> aired.
//
// How a pre-recorded show airs TODAY: it doesn't. Approving one only reserves the time (airSlots) and shows it on the schedule; the `audioURL` is a link
// staff read on Admin > Slots, and nothing on the station plays it. So an attached recording gets the smallest mechanism that does:
// when the show is approved (or the recording is attached to an approved show), a one-time playlist is made in AzuraCast with the recording in it and a
// dated schedule for exactly the show's slot (interrupts what is playing, plays once). When the show is over the playlist is removed.
export const REC_STATUS = ['recording', 'uploading', 'uploaded', 'attached', 'aired'] as const
export type RecStatus = (typeof REC_STATUS)[number]

const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? 0
export interface RecRow { id: string; uid: string; title: string; status: string; durationSec: number; requestId: string; bookingId: string; createdAt: number; scheduled: boolean }
export const recRow = (d: FirebaseFirestore.DocumentSnapshot): RecRow => ({
  id: d.id, uid: String(d.get('uid') ?? ''), title: String(d.get('title') ?? ''), status: String(d.get('status') ?? ''), durationSec: Number(d.get('durationSec') ?? 0),
  requestId: String(d.get('requestId') ?? ''), bookingId: String(d.get('bookingId') ?? ''), createdAt: ms(d.get('createdAt')), scheduled: !!d.get('playlistId'),
})

// ── airing through AzuraCast ───────────────────────────────
/** Makes the one-time playlist for an approved pre-recorded show that has a recording attached. Safe to call again: it does nothing twice. */
export async function airRecording(db: Firestore, requestId: string): Promise<'scheduled' | 'skipped' | 'failed'> {
  const req = await db.collection('slotRequests').doc(requestId).get()
  const recId = String(req.get('attachedRecordingId') ?? '')
  if (!req.exists || !recId || req.get('status') !== 'approved' || req.get('type') !== 'prerecorded') return 'skipped'
  const recRef = db.collection('recordings').doc(recId)
  const rec = await recRef.get()
  if (!rec.exists || rec.get('playlistId')) return 'skipped'
  if (!azuraConfigured()) return 'skipped'
  const media = await azFindMedia(String(rec.get('azuracastPath') ?? ''), 1)
  if (!media) { await recRef.update({ airError: 'The file was not found in AzuraCast.' }).catch(() => {}); return 'failed' }
  const tz = (await loadConfig(db)).timezone
  const items = blockToItems(ms(req.get('startAt')), ms(req.get('endAt')), tz).map(i => ({ ...i, loop_once: true }))
  const pl = await az<{ id: number }>(`/station/${station()}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Student show ${requestId}`, is_enabled: true, type: 'default', source: 'songs', order: 'sequential', weight: 25,
      include_in_requests: false, include_in_on_demand: false, backend_options: ['interrupt'], schedule_items: items,
    }),
  })
  await azSetPlaylists(media.id, [pl.id])
  await recRef.update({ playlistId: pl.id, mediaId: media.id, scheduledAt: Timestamp.now(), airError: FieldValue.delete() })
  return 'scheduled'
}

async function dropPlaylist(playlistId: unknown) {
  if (typeof playlistId !== 'number' || !azuraConfigured()) return
  await az(`/station/${station()}/playlist/${playlistId}`, { method: 'DELETE' }).catch(e => console.error('[recording playlist]', e))
}

/** The show was cancelled or declined: the recording goes back to the student's list and its one-time playlist is removed. */
export async function releaseRecording(db: Firestore, requestId: string) {
  const req = await db.collection('slotRequests').doc(requestId).get()
  const recId = String(req.get('attachedRecordingId') ?? '')
  if (!recId) return
  const rec = await db.collection('recordings').doc(recId).get()
  if (rec.exists) {
    await dropPlaylist(rec.get('playlistId'))
    await rec.ref.update({ status: 'uploaded', requestId: FieldValue.delete(), playlistId: FieldValue.delete(), mediaId: FieldValue.delete(), scheduledAt: FieldValue.delete() })
  }
  await req.ref.update({ attachedRecordingId: FieldValue.delete() }).catch(() => {})
}

/** Attach one of the person's recordings to one of their upcoming pre-recorded shows (moves it if it was on another show). Used by
 *  /api/recordings/attach and by the studio PC's "Save" (when the student picked a show and ticked "clean"). */
export async function attachRecording(db: Firestore, uid: string, recordingId: string, requestId: string, cleanConfirmed: unknown, now = Date.now()) {
  const [rec, req2] = await Promise.all([db.collection('recordings').doc(recordingId).get(), db.collection('slotRequests').doc(requestId).get()])
  if (!rec.exists) throw new HttpError(404, 'Recording not found.', 'BR-REC-001')
  if (!req2.exists) throw new HttpError(404, 'Show not found.', 'BR-REC-003')
  const bad = attachProblem({
    cleanConfirmed, recOwner: String(rec.get('uid')), reqOwner: String(req2.get('requesterUid')), uid, recStatus: String(rec.get('status')),
    reqType: String(req2.get('type')), reqStatus: String(req2.get('status')), reqStart: ms(req2.get('startAt')), now,
  })
  if (bad) throw new HttpError(bad.status, bad.message, bad.code)
  // A recording moved from another show, or another recording replaced on this show: undo the old link first.
  if (rec.get('requestId') && rec.get('requestId') !== requestId) await releaseRecording(db, String(rec.get('requestId')))
  const old = String(req2.get('attachedRecordingId') ?? '')
  if (old && old !== recordingId) await releaseRecording(db, requestId)
  await db.runTransaction(async tx => {
    tx.update(rec.ref, { status: 'attached', requestId, attachedAt: Timestamp.now(), cleanConfirmedAt: Timestamp.now() })
    tx.update(req2.ref, { attachedRecordingId: recordingId })
  })
  let scheduled = false
  if (req2.get('status') === 'approved') scheduled = (await airRecording(db, requestId).catch(e => { console.error('[recording air]', e); return 'failed' as const })) === 'scheduled'
  const slotSec = Number(req2.get('durationMin')) * 60, len = Number(rec.get('durationSec'))
  return { scheduled, ...(len > slotSec ? { warning: 'The recording is longer than the booked time, so the end will be cut off. Pick a longer slot or a shorter recording.' } : {}) }
}

/** Recordings whose show is over become `aired`, and the one-time playlist is removed. Housekeeping: runs inside an existing run, never from its own cron. */
export async function finishRecordings(db: Firestore, now = Date.now()): Promise<number> {
  const snap = await db.collection('recordings').where('status', '==', 'attached').limit(50).get()
  if (!snap.size) return 0
  const reqs = await db.getAll(...snap.docs.map(d => db.collection('slotRequests').doc(String(d.get('requestId')))), { fieldMask: ['endAt', 'status'] })
  const by = new Map(reqs.map(r => [r.id, r]))
  let n = 0
  for (const d of snap.docs) {
    const r = by.get(String(d.get('requestId')))
    if (r?.exists && ms(r.get('endAt')) > now) continue
    await dropPlaylist(d.get('playlistId'))
    await d.ref.update({ status: 'aired', playlistId: FieldValue.delete() })
    n++
  }
  return n
}

/** Deletes a recording: its AzuraCast file (best effort), its one-time playlist and the link from the show. */
export async function deleteRecording(db: Firestore, id: string, actor: { uid: string; staff: boolean }) {
  const ref = db.collection('recordings').doc(id)
  const d = await ref.get()
  if (!d.exists || (d.get('uid') !== actor.uid && !actor.staff)) throw new HttpError(404, 'Recording not found.', 'BR-REC-001')
  const reqId = String(d.get('requestId') ?? '')
  if (reqId) await releaseRecording(db, reqId).catch(e => console.error('[recording release]', e))
  const path = String(d.get('azuracastPath') ?? '')
  if (path && azuraConfigured()) {
    try { const m = await azFindMedia(path, 1); if (m) await azDeleteMedia(m.id) } catch (e) { console.error('[recording delete]', e) }
  }
  await ref.delete()
  return { ok: true }
}
