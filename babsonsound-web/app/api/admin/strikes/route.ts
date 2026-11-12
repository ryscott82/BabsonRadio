import { adminDb } from '@/lib/server/admin'
import { handle, requireDirector } from '@/lib/server/http'
import { listStrikes, scanStrikes } from '@/lib/server/strikes'

export const runtime = 'nodejs'

// E-board and Admin: strikes, pending flags first (then the latest decided ones), with the person's name and email. Opening this also looks for newly
// missed shows (at most once every 10 minutes). Decide with POST /api/admin/strikes/decide.
export async function GET(req: Request) {
  return handle(async () => {
    await requireDirector(req)
    const db = adminDb()
    await scanStrikes(db).catch(e => console.error('[strike scan]', e))
    return { strikes: await listStrikes(db) }
  }, { 'Cache-Control': 'private, no-store' })
}
