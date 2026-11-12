import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { runAutoApprove } from '@/lib/server/autoApprove'

export const runtime = 'nodejs'

// Admin > Slots calls this when it opens (the page reads the requests straight from Firestore, so nothing else would approve what is due).
// Approves every request whose time has come and nothing stops. Cheap when nothing is due (one query). Reply: { checked, approved, blocked, failed }.
export async function POST(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    return runAutoApprove(adminDb())
  }, { 'Cache-Control': 'no-store' })
}
