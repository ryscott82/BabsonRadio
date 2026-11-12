import { handle, requireAdmin } from '@/lib/server/http'
import { settingsHistory } from '@/lib/server/adminSettings'

export const runtime = 'nodejs'

// GET ?limit=50&before=<at>  newest first: { lines: [{ id, at, by, key, label, old, new }], next }  (pass next as `before` for the following page)
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const u = new URL(req.url)
    const before = Number(u.searchParams.get('before'))
    return settingsHistory(Number(u.searchParams.get('limit')) || 50, Number.isFinite(before) && before > 0 ? before : null)
  })
}
