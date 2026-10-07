import { adminDb } from '@/lib/server/admin'
import { handle, requireStaff } from '@/lib/server/http'
import { loadConfig } from '@/lib/server/autoschedule'
import { azuraStatus, syncToAzuraCast } from '@/lib/server/azuracast'

export const runtime = 'nodejs'

// GET: test the connection and show which genres have a matching AzuraCast playlist.
export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    return azuraStatus(await loadConfig(adminDb()))
  })
}

// POST: push the current plan to AzuraCast now (without rebuilding it).
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const db = adminDb()
    return syncToAzuraCast(db, await loadConfig(db))
  })
}
