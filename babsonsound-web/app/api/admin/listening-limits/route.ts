import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { limitsInfo, saveLimits } from '@/lib/server/listenLimits'

export const runtime = 'nodejs'

// Listening limits for students and guests. Admins only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return limitsInfo() })
}

// { budgetEnabled?, student?: {...}, guest?: {...} }  each audience: idleMin, sessionMaxMin, dailyCapMin, dailyAutoMin, quietEnabled, quietStart, quietEnd (0 = no limit).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    try { await saveLimits(b, t.uid) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Could not save.', 'BR-LIM-001') }
    return limitsInfo()
  })
}
