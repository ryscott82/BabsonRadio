import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { hostContext } from '@/lib/server/host'
import { hostAccess } from '@/lib/server/liveData'

export const runtime = 'nodejs'

// Does this person host anything? `hosting` is host mode: today is a day one of their shows is on (the app shows the Host tab).
// `controlsOpen` is narrower: inside the 4-hour window around a show, when the controls actually work.
// (The web page now gets this from /api/live/bundle; this route stays for older app builds.)
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    return hostAccess(db, await hostContext(req, db, now, true), now)
  })
}
