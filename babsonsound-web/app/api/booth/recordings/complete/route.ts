import { Timestamp } from 'firebase-admin/firestore'
import { after } from 'next/server'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, str } from '@/lib/server/http'
import { recordingCaller } from '@/lib/server/boothRecordings'
import { attachRecording, cleanPath } from '@/lib/server/recordings'
import { recordingReadyMail, sendMail } from '@/lib/server/mailer'
import { publishLiveEpisode } from '@/lib/server/liveEpisode'

export const runtime = 'nodejs'

// The studio PC says the upload to AzuraCast finished: { id, azuracastPath, durationSec, token? } -> { ok, attached, warning? }. The recording becomes
// `uploaded` and the student gets an email. If they picked one of their pre-recorded shows and confirmed it is clean, it is attached to that show too
// (if that fails, it stays uploaded and they can attach it on the site). Calling it again changes nothing. The owner, or the studio PC for them.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readJson(req)
    const who = await recordingCaller(req, b, Date.now(), true)
    const id = str(b.id, 100), path = cleanPath(b.azuracastPath), dur = Math.round(Number(b.durationSec))
    if (!id || !path || !Number.isFinite(dur) || dur < 1 || dur > 86_400) throw new HttpError(400, 'Send the recording id, its AzuraCast path and its length in seconds.')
    const db = adminDb()
    const ref = db.collection('recordings').doc(id)
    const r = await db.runTransaction(async tx => {
      const d = await tx.get(ref)
      if (!d.exists || d.get('uid') !== who.uid) throw new HttpError(404, 'Recording not found.', 'BR-REC-001')
      if (d.get('status') !== 'recording' && d.get('status') !== 'uploading') return { first: false, title: '', forRequestId: '', clean: false }
      tx.update(ref, { azuracastPath: path, durationSec: dur, status: 'uploaded', uploadedAt: Timestamp.now() })
      return { first: true, title: String(d.get('title') ?? 'Your recording'), forRequestId: String(d.get('forRequestId') ?? ''), clean: d.get('cleanConfirmed') === true }
    })
    let attached = false, warning = ''
    // A live show archived by the studio PC goes straight into the library. If AzuraCast is slow to list the file, the PC calls again later and this retries.
    const isLive = (await ref.get()).get('kind') === 'live'
    if (isLive) {
      try { await publishLiveEpisode(db, id) } catch (e) { throw new HttpError(503, `The recording is saved; the library entry will be made on the next try. ${e instanceof Error ? e.message : ''}`.trim()) }
      return { ok: true, attached: false }
    }
    if (r.first && r.forRequestId && r.clean) {
      try { const a = await attachRecording(db, who.uid, id, r.forRequestId, true); attached = true; warning = a.warning ?? '' }
      catch (e) { warning = e instanceof Error ? `Saved, but not attached to the show: ${e.message}` : 'Saved, but not attached to the show.' }
    }
    if (r.first && who.email) { const m = recordingReadyMail({ title: r.title }); after(() => sendMail(who.email, m.subject, m.text, m.html)) }
    return { ok: true, attached, ...(warning ? { warning } : {}) }
  })
}
