import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { workerState } from '@/lib/server/worker'

export const runtime = 'nodejs'

// One document read. online = the PC's last heartbeat is under 3 minutes old.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    return workerState(adminDb())
  })
}
