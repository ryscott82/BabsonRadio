import { adminDb } from '@/lib/server/admin'
import { handle, readJson, requireStaff } from '@/lib/server/http'
import { loadEggs, saveEggs } from '@/lib/server/easterEggs'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => { await requireStaff(req); return { eggs: await loadEggs(adminDb()) } })
}

export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireStaff(req)
    const b = await readJson(req)
    return { eggs: await saveEggs(adminDb(), b.eggs, t.uid) }
  })
}
