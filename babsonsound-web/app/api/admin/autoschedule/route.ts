import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { loadConfig, saveConfig } from '@/lib/server/autoschedule'
import { calendarKey, prelaunchOn } from '@/lib/prelaunch'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const origin = new URL(req.url).origin
    const k = prelaunchOn() ? await calendarKey() : null
    return { config: await loadConfig(adminDb()), calendarUrl: `${origin}/api/calendar.ics${k ? `?k=${k}` : ''}` }
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    return { config: await saveConfig(adminDb(), b.config, t.uid) }
  })
}
