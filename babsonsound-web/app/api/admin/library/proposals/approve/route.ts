import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin } from '@/lib/server/http'
import { approveAbove, approveProposals } from '@/lib/server/worker'

export const runtime = 'nodejs'

// POST { ids: [...] } (up to 400), or { minConfidence: 0.9 } to approve every pending proposal at or above it (up to 400 per call; `more` says to call again).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    return b.minConfidence !== undefined ? approveAbove(adminDb(), b.minConfidence, t.uid) : approveProposals(adminDb(), b.ids, t.uid)
  })
}
