import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireAdmin } from '@/lib/server/http'
import { editProposal } from '@/lib/server/worker'

export const runtime = 'nodejs'

// POST { id, fields: { title?, artist?, album?, artUrl? } }. The proposal goes back to pending (approve it again to apply the edit).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    return editProposal(adminDb(), b.id, b.fields, t.uid)
  })
}
