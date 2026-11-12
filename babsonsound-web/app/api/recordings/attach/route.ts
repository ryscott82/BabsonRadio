import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireMember, str } from '@/lib/server/http'
import { attachRecording } from '@/lib/server/recordings'

export const runtime = 'nodejs'

// Attach one of my recordings to one of my upcoming pre-recorded shows: { recordingId, requestId, cleanConfirmed: true }.
// cleanConfirmed is the box "I listened to the whole recording and it is clean": without it nothing is attached. If the show is already approved it is
// scheduled in AzuraCast right away; otherwise that happens when it is approved. Attaching to another show moves it. Reply: { ok, scheduled, warning? }.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const b = await readJson(req)
    const recordingId = str(b.recordingId, 100), requestId = str(b.requestId, 100)
    if (!recordingId || !requestId) throw new HttpError(400, 'Pick a recording and a show.')
    return { ok: true, ...(await attachRecording(adminDb(), t.uid, recordingId, requestId, b.cleanConfirmed)) }
  })
}
