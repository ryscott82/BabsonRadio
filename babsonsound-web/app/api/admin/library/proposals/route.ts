import { adminDb } from '@/lib/server/admin'
import { handle, requireAdmin } from '@/lib/server/http'
import { listProposals } from '@/lib/server/worker'

export const runtime = 'nodejs'

// GET ?status=pending|approved|rejected|applied|failed &q=<start of "artist title"> &page=1 &after=<cursor from the last page's next>
// 50 per page, read once per call (not live). Prefer `after` over `page` > 1 (page skips are billed).
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const u = new URL(req.url).searchParams
    return listProposals(adminDb(), { status: u.get('status') || undefined, q: u.get('q') || undefined, page: Number(u.get('page')) || 1, after: u.get('after') || undefined })
  })
}
