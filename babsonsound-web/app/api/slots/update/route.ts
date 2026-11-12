import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { checkAudioUpdate } from '@/lib/slotAuto'

export const runtime = 'nodejs'

// A student changes the audio link of their own pre-recorded show (pending or approved, not started yet). https only.
//   POST { requestId, audioURL }   -> { ok: true }
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const requestId = str(b.requestId, 100)
    const audioURL = str(b.audioURL, 500)
    if (!requestId || !audioURL) throw new HttpError(400, 'Give the request and an https audio link.')
    const ref = adminDb().collection('slotRequests').doc(requestId)
    const r = await ref.get()
    if (!r.exists) throw new HttpError(404, 'Request not found.')
    const c = checkAudioUpdate({
      ownerUid: String(r.get('requesterUid')), uid: t.uid, type: String(r.get('type')), status: String(r.get('status')),
      startMs: r.get('startAt').toMillis(), now: Date.now(), audioURL,
    })
    if (!c.ok) throw new HttpError(c.status, c.message)
    await ref.update({ audioURL, audioUpdatedAt: Timestamp.now() })
    return { ok: true }
  })
}
