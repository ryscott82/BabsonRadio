import { adminDb } from '@/lib/server/admin'
import { HttpError, handle } from '@/lib/server/http'
import { assertCanManage, deepLink, loadSession, settleStatus, studioActor } from '@/lib/server/studio'
import { upcomingCodes } from '@/lib/studioRules'

export const runtime = 'nodejs'

// Trainer only. The code is the first 6 digits of HMAC(secret, 30-second window). To avoid polling, this returns the current code
// and the next nine (five minutes), each with the time span to show it for and its QR link. Fetch again about every four minutes.
// The secret itself is never returned.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await studioActor(req, 'staff')
    const { id } = await params
    const db = adminDb()
    let s = await loadSession(db, id)
    assertCanManage(s, actor)
    const now = Date.now()
    s = await settleStatus(db, s, now)
    if (s.status !== 'checkin_open') throw new HttpError(409, 'Open check-in first.', 'BR-STU-004')
    const codes = upcomingCodes(s.checkinSecret, now).map(c => ({ ...c, link: deepLink(id, c.code) }))
    return { now, codes, refetchBy: codes[codes.length - 2].from }
  }, { 'Cache-Control': 'no-store' })
}
