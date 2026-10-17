import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { loadBlocked, saveBlocked } from '@/lib/server/wordFilter'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => { await requireStaff(req); return { words: await loadBlocked(adminDb()) } })
}

// Saves the whole list (the built-in starter words always stay on).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    return { words: await saveBlocked(adminDb(), b.words, t.uid) }
  })
}
