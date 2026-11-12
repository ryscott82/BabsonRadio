import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { recRow } from '@/lib/server/recordings'

export const runtime = 'nodejs'

// My recordings (latest 50, newest first): { recordings: [{ id, title, status, durationSec, requestId, bookingId, createdAt, scheduled }] }.
// status: recording, uploading, uploaded, attached (to a show), aired. Not polled.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    const snap = await adminDb().collection('recordings').where('uid', '==', t.uid).get()
    return { recordings: snap.docs.map(recRow).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) }
  }, { 'Cache-Control': 'private, no-store' })
}
