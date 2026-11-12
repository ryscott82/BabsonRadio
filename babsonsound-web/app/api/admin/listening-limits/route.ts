import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { limitsInfo, loadLimits, saveLimits } from '@/lib/server/listenLimits'
import { logSettingChanges } from '@/lib/server/adminSettings'
import { storeChanges } from '@/lib/adminSettings'
import { adminDb } from '@/lib/server/admin'

export const runtime = 'nodejs'

// Listening limits for students and guests. Admins only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return limitsInfo() })
}

// { budgetEnabled?, refreshSec? (120 to 3600: seconds between a listening page's check-ins, default 720), student?: {...}, guest?: {...} }  each audience: idleMin, sessionMaxMin, dailyCapMin, dailyAutoMin, quietEnabled, quietStart, quietEnd (0 = no limit). idleMin and sessionMaxMin are run by the page / app; the daily limits are no longer enforced (the server keeps no per-day counters).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    const db = adminDb()
    const before = await loadLimits(db)
    let after
    try { after = await saveLimits(b, t.uid) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Could not save.', 'BR-LIM-001') }
    await logSettingChanges(db, storeChanges('limits', before, after), t.email ?? t.uid).catch(e => console.error('[settingsLog]', e)) // Settings history stays complete
    return limitsInfo()
  })
}
