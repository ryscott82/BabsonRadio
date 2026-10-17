import { adminDb } from '@/lib/server/admin'
import { handle } from '@/lib/server/http'
import { hostContext, hostDayActive } from '@/lib/server/host'
import { loadConfig } from '@/lib/server/autoschedule'
import { award } from '@/lib/server/earnedEmojis'

export const runtime = 'nodejs'

// Does this person host anything? `hosting` is host mode: today is a day one of their shows is on (the app shows the Host tab).
// `controlsOpen` is narrower: inside the 4-hour window around a show, when the controls actually work.
export async function GET(req: Request) {
  return handle(async () => {
    const db = adminDb()
    const now = Date.now()
    const c = await hostContext(req, db, now)
    const tz = (await loadConfig(db)).timezone
    if (c.shows.length > 0) await award(db, c.t.uid, '🎤').catch(() => {})
    return { host: c.staff || c.shows.length > 0, hosting: hostDayActive(c.shows, now, tz), controlsOpen: c.open.length > 0 }
  })
}
