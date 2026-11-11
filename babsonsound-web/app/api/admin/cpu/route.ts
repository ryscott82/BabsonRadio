import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireStaff } from '@/lib/server/http'
import { cpuState, resetCpuCache } from '@/lib/server/cpuBudget'
import { resetUsageStatus } from '@/lib/server/serverUsage'
import { cleanDirectAt, cleanDirectMode, cleanLocks, cleanThresholds, DIRECT_MODES, TIERS } from '@/lib/cpuTiers'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => { await requireStaff(req); resetCpuCache(); return cpuState(adminDb()) })
}

// GET -> the meter state, including `pressure` (share of the allowance, used or on track) and `tiers` (level of tiers 1 to 3, and whether an admin locked it).
// POST { budgetHours?, reactionShare?, baseHours?, reactionsLocked?, auto?,
//        tierLocks?: { "1"|"2"|"3": 'normal'|'tight'|'critical'|null }   pin a tier by hand (null = back to automatic),
//        nowPlayingDirect?: 'auto' | 'off' | 'on'   the backup way to read now playing (default auto), directAt?: 0.1 to 2 (share of the allowance where auto switches on, default 0.75)
//        thresholds?: { "1"|"2"|"3": { tight, critical } }               share of the allowance where a tier steps up (above 1 = never by itself) }
export async function POST(req: Request) {
  return handle(async () => {
    const who = await requireStaff(req)
    const b = await readJson(req)
    const out: Record<string, unknown> = {}
    const num = (k: string, lo: number, hi: number) => {
      if (b[k] === undefined) return
      const v = Number(b[k])
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${k} is out of range.`)
      out[k] = v
    }
    num('budgetHours', 0.1, 10000); num('reactionShare', 0.01, 1); num('baseHours', 0, 10000)
    if (typeof b.reactionsLocked === 'boolean') out.reactionsLocked = b.reactionsLocked
    if (typeof b.auto === 'boolean') out.auto = b.auto
    if (b.nowPlayingDirect !== undefined) {
      if (!(DIRECT_MODES as unknown[]).includes(b.nowPlayingDirect)) throw new HttpError(400, 'nowPlayingDirect must be auto, off or on.')
      out.nowPlayingDirect = cleanDirectMode(b.nowPlayingDirect)
    }
    if (b.directAt !== undefined) {
      if (cleanDirectAt(b.directAt) !== b.directAt) throw new HttpError(400, 'directAt must be from 0.1 to 2.')
      out.directAt = b.directAt
    }
    const db = adminDb()
    if (b.tierLocks !== undefined) {
      if (!b.tierLocks || typeof b.tierLocks !== 'object') throw new HttpError(400, 'tierLocks is not valid.')
      const cur = (await cpuState(db)).config.tierLocks
      const posted = b.tierLocks as Record<string, unknown>
      const next = { ...cur, ...cleanLocks(posted) }
      for (const t of TIERS) if (t in posted || String(t) in posted) { if (posted[String(t)] === null || posted[String(t)] === 'auto') delete next[t] }
      out.tierLocks = next
    }
    if (b.thresholds !== undefined) {
      if (!b.thresholds || typeof b.thresholds !== 'object') throw new HttpError(400, 'thresholds is not valid.')
      out.thresholds = cleanThresholds(b.thresholds, (await cpuState(db)).config.thresholds)
    }
    const ref = db.collection('usage').doc('cpuConfig')
    const { tierLocks, ...rest } = out
    if (Object.keys(rest).length) await ref.set(rest, { merge: true })
    if (tierLocks !== undefined) { await ref.set({}, { merge: true }); await ref.update({ tierLocks }) } // update() replaces the whole map, so a cleared lock really goes
    // Every change is logged next to the automatic level changes (collection cpuTierLog).
    await db.collection('cpuTierLog').add({ at: Date.now(), by: who.email ?? who.uid, change: out })
    resetCpuCache()
    resetUsageStatus()
    return { ok: true }
  })
}
