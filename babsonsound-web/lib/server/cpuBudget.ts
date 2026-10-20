import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'

// Vercel's free plan pauses the whole site when its server-time allowance (4 hours a month) runs out.
// This keeps our own tally of server time and shuts reactions off first, so the rest of the site stays up.
//  - Each server instance counts its own CPU time and the time spent in reaction requests, and adds both to this month's
//    document about once a minute (a few writes an hour).
//  - Reactions lock when: an admin locks them, they use more than their share of the budget, or the site as a whole is close to the limit.
//  - Locked reactions still rain on each person's own screen. Nothing shows an error.
// Counts are an estimate of what Vercel bills: use "Already counted by Vercel" on the admin page to line them up.

export interface CpuConfig { budgetHours: number; reactionShare: number; baseHours: number; reactionsLocked: boolean; auto: boolean }
export const DEFAULT_CPU: CpuConfig = { budgetHours: 4, reactionShare: 0.25, baseHours: 0, reactionsLocked: false, auto: true }
export interface CpuState {
  locked: boolean; reason: string; usedHours: number; reactionsHours: number; projectedHours: number
  config: CpuConfig; month: string; byDay: Record<string, number>
}

const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7)

// ── counting ──
let lastCpu = 0, lastFlush = Date.now(), wallReactions = 0, wallOther = 0
const cpuSec = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6 }

/** Called around every API request. `bucket` says whether it was a reaction request. */
export async function counted<T>(bucket: 'reactions' | 'other', fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try { return await fn() }
  finally {
    const ms = Date.now() - t0
    if (bucket === 'reactions') wallReactions += ms; else wallOther += ms
    const now = Date.now()
    if (now - lastFlush > 60_000) void flush(now)
  }
}

async function flush(now: number) {
  lastFlush = now
  const c = cpuSec(), delta = Math.max(0, c - lastCpu); lastCpu = c
  const wr = wallReactions, wo = wallOther; wallReactions = 0; wallOther = 0
  const r = wr + wo > 0 ? delta * wr / (wr + wo) : 0
  if (delta <= 0) return
  const day = String(new Date(now).getUTCDate())
  try {
    await adminDb().collection('usage').doc(`cpu-${monthOf(now)}`).set({
      total: FieldValue.increment(delta), reactions: FieldValue.increment(r),
      d: { [day]: { total: FieldValue.increment(delta), reactions: FieldValue.increment(r) } },
    }, { merge: true })
  } catch { /* the next flush counts again from here; a miss only under-counts slightly */ }
}

// ── deciding ──
let cached: { at: number; v: CpuState } | null = null
export const resetCpuCache = () => { cached = null }

export async function loadCpuConfig(db: Firestore): Promise<CpuConfig> {
  const d = (await db.collection('usage').doc('cpuConfig').get()).data() ?? {}
  const n = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : def)
  return {
    budgetHours: n(d.budgetHours, DEFAULT_CPU.budgetHours, 0.1, 10000),
    reactionShare: n(d.reactionShare, DEFAULT_CPU.reactionShare, 0.01, 1),
    baseHours: n(d.baseHours, DEFAULT_CPU.baseHours, 0, 10000),
    reactionsLocked: d.reactionsLocked === true,
    auto: d.auto !== false,
  }
}

export async function cpuState(db: Firestore = adminDb(), now = Date.now()): Promise<CpuState> {
  if (cached && now - cached.at < 30_000) return cached.v
  const [config, snap] = await Promise.all([loadCpuConfig(db), db.collection('usage').doc(`cpu-${monthOf(now)}`).get()])
  const total = (snap.get('total') as number | undefined) ?? 0
  const rx = (snap.get('reactions') as number | undefined) ?? 0
  const days = (snap.get('d') ?? {}) as Record<string, { total?: number }>
  const byDay: Record<string, number> = {}
  for (const [k, v] of Object.entries(days)) byDay[k] = Math.round(((v.total ?? 0) / 3600) * 100) / 100
  // Trust the fresher of "what we counted" and "what Vercel showed when the offset was typed in" by adding the offset.
  const usedHours = total / 3600 + config.baseHours
  const reactionsHours = rx / 3600
  const d = new Date(now)
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  const frac = Math.max(0.05, (d.getUTCDate() - 1 + d.getUTCHours() / 24) / dim)
  const projectedHours = usedHours / frac
  let reason = ''
  if (config.reactionsLocked) reason = 'Locked by an admin.'
  else if (config.auto) {
    if (reactionsHours > config.reactionShare * config.budgetHours) reason = 'Reactions used their share of server time this month.'
    else if (usedHours >= 0.8 * config.budgetHours) reason = 'The site is close to its server-time limit.'
    else if (projectedHours > config.budgetHours && usedHours > 0.3 * config.budgetHours) reason = 'The site is on track to pass its server-time limit.'
  }
  const v: CpuState = { locked: !!reason, reason, usedHours, reactionsHours, projectedHours, config, month: monthOf(now), byDay }
  cached = { at: now, v }
  return v
}

/** True when reactions should do no work. Never throws: if the check fails, reactions stay on. */
export async function reactionsLocked(): Promise<boolean> {
  try { return (await cpuState()).locked } catch { return false }
}
