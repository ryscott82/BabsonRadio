import { adminDb } from '@/lib/server/admin'
import { handle, requireMember } from '@/lib/server/http'
import { standingFor } from '@/lib/server/strikes'

export const runtime = 'nodejs'

// My standing: { level: 0 to 3, label: 'Good standing' | '1 mistake' | 'Warning' | 'Banned until <date>', bannedUntil, strikes: [{ date, reason }] }.
// Only confirmed strikes that have not expired are listed. Flags waiting for the E-board are not shown. Not polled.
export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireMember(req)
    return standingFor(adminDb(), t.uid)
  }, { 'Cache-Control': 'private, no-store' })
}
