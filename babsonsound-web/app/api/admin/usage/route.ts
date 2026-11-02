import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff } from '@/lib/server/http'
import { budgetState, loadUsageConfig, policyFor, resetBudgetCache, resetUsageConfigCache } from '@/lib/server/usage'
import { forecastUsage } from '@/lib/server/forecastUsage'
import { loadLimits } from '@/lib/server/listenLimits'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const db = adminDb()
    const [b, config, sess] = await Promise.all([
      budgetState(db), loadUsageConfig(db),
      db.collection('listenGuard').where('lastBeat', '>', Timestamp.fromMillis(Date.now() - 3 * 60_000)).count().get(),
    ])
    const f = await forecastUsage(db, b.usedHours).catch(() => null)
    const limits = await loadLimits(db)
    return { budgetEnabled: limits.budgetEnabled, budget: b, policy: policyFor(b), config, activeSessions: sess.data().count, forecast: f && { mode: f.mode, sigma: f.sigma, historyDays: f.historyDays, level: f.level, lifts: f.lifts.slice(0, 12) } }
  })
}

// { limitHours?, quietEnabled?, quietStart?, quietEnd?, guestAutoMin? }
export async function POST(req: Request) {
  return handle(async () => {
    await requireStaff(req)
    const b = await readJson(req)
    const out: Record<string, number | boolean> = {}
    const num = (k: string, lo: number, hi: number) => {
      if (b[k] === undefined) return
      const v = Number(b[k])
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${k} is out of range.`)
      out[k] = Math.round(v)
    }
    num('limitHours', 1, 100000); num('quietStart', 0, 23); num('quietEnd', 0, 23); num('guestAutoMin', 0, 600)
    if (typeof b.quietEnabled === 'boolean') out.quietEnabled = b.quietEnabled
    await adminDb().collection('usage').doc('config').set(out, { merge: true })
    resetUsageConfigCache()
    resetBudgetCache()
    return { ok: true }
  })
}
