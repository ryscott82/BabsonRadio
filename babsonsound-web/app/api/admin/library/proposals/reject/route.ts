import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin } from '@/lib/server/http'
import { rejectProposals } from '@/lib/server/worker'

export const runtime = 'nodejs'

// POST { ids: [...] } (up to 400)
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    return rejectProposals(adminDb(), (await readJson(req)).ids, t.uid)
  })
}
