import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff } from '@/lib/server/http'
import { cpuState, resetCpuCache } from '@/lib/server/cpuBudget'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => { await requireStaff(req); resetCpuCache(); return cpuState(adminDb()) })
}

// { budgetHours?, reactionShare?, baseHours?, reactionsLocked?, auto? }
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const out: Record<string, number | boolean> = {}
    const num = (k: string, lo: number, hi: number) => {
      if (b[k] === undefined) return
      const v = Number(b[k])
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${k} is out of range.`)
      out[k] = v
    }
    num('budgetHours', 0.1, 10000); num('reactionShare', 0.01, 1); num('baseHours', 0, 10000)
    if (typeof b.reactionsLocked === 'boolean') out.reactionsLocked = b.reactionsLocked
    if (typeof b.auto === 'boolean') out.auto = b.auto
    await adminDb().collection('usage').doc('cpuConfig').set(out, { merge: true })
    resetCpuCache()
    return { ok: true }
  })
}
