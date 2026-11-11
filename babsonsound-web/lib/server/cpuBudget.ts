import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { DEFAULT_DIRECT_AT, DEFAULT_THRESHOLDS, cleanDirectAt, cleanDirectMode, cleanLocks, directActive, type DirectMode, cleanThresholds, pressureOf, tierStatuses, type Locks, type Thresholds, type Tier, type TierStatus } from '../cpuTiers'

// Vercel's free plan pauses the whole site when its server-time allowance (4 hours a month) runs out.
// This keeps our own tally of server time and eases features off in tiers (lib/cpuTiers.ts), so the stream, now playing and the schedule stay up.
//  - Each server instance counts its own CPU time and the time spent in reaction requests, and adds both to this month's
//    document about once a minute (a few writes an hour).
//  - Every feature sits in a tier. As the month fills (used, or on track to use) Tier 3 (reactions, emoji palette) is rate limited, then
//    switched off; then Tier 2 (presence, listening check-in, skip, vote, set list, ratings); Tier 1 (sign-in, /api/me) only at the very end.
//    An admin can pin any tier to normal / tight / critical by hand. Reactions also go off when they use more than their share (reactionShare).
//  - Throttled features answer with the last result or an empty one. Nothing shows an error (lib/server/tierGate.ts).
//  - Each change of level is logged (console and the cpuTierLog collection).
// Counts are an estimate of what Vercel bills: use "Already counted by Vercel" on the admin page to line them up.

export interface CpuConfig { budgetHours: number; reactionShare: number; baseHours: number; reactionsLocked: boolean; auto: boolean; thresholds: Thresholds; tierLocks: Locks; nowPlayingDirect: DirectMode; directAt: number }
export const DEFAULT_CPU: CpuConfig = { budgetHours: 4, reactionShare: 0.25, baseHours: 0, reactionsLocked: false, auto: true, thresholds: DEFAULT_THRESHOLDS, tierLocks: {}, nowPlayingDirect: 'auto', directAt: DEFAULT_DIRECT_AT }
export interface CpuState {
  locked: boolean; reason: string; usedHours: number; reactionsHours: number; projectedHours: number
  config: CpuConfig; month: string; byDay: Record<string, number>
  /** How full the month is, as a share of the allowance (used, or on track to use). */
  pressure: number
  /** Level of each tier now. */
  tiers: Record<Tier, TierStatus>
  /** Pages watch AzuraCast's public feed instead of polling our now-playing route (see lib/cpuTiers.ts). */
  directFeed: boolean
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
    thresholds: cleanThresholds(d.thresholds),
    tierLocks: cleanLocks(d.tierLocks),
    nowPlayingDirect: cleanDirectMode(d.nowPlayingDirect),
    directAt: cleanDirectAt(d.directAt),
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
  const elapsedFrac = (d.getUTCDate() - 1 + d.getUTCHours() / 24) / dim
  const pressure = config.auto ? pressureOf({ usedHours, projectedHours, budgetHours: config.budgetHours, elapsedFrac }) : 0
  // Manual locks win. The old "reactions locked" switch and "reactions used their share" rule both mean: Tier 3 off.
  const locks: Locks = { ...config.tierLocks }
  let reason = ''
  if (config.reactionsLocked) { locks[3] = 'critical'; reason = 'Locked by an admin.' }
  else if (config.auto && !locks[3] && reactionsHours > config.reactionShare * config.budgetHours) { locks[3] = 'critical'; reason = 'Reactions used their share of server time this month.' }
  const tiers = tierStatuses(pressure, config.thresholds, locks)
  if (!reason && tiers[3].level === 'critical') reason = tiers[3].reason
  const v: CpuState = { locked: tiers[3].level === 'critical', reason, usedHours, reactionsHours, projectedHours, config, month: monthOf(now), byDay, pressure, tiers, directFeed: directActive(config.nowPlayingDirect, pressure, config.directAt) }
  noteLevels(db, v, now)
  cached = { at: now, v }
  return v
}

// ── logging level changes, and the usage alerts that ride on the same 30-second computation ──
let lastLevels: string | null = null
function noteLevels(db: Firestore, v: CpuState, now: number) {
  const key = ([1, 2, 3] as Tier[]).map(t => `${t}${v.tiers[t].level[0]}`).join(' ')
  if (lastLevels !== null && key !== lastLevels) {
    console.log(`[cpu-tier] ${lastLevels} -> ${key} pressure=${Math.round(v.pressure * 100)}%`)
    // One document per change (the id repeats within 10 minutes, so servers that all notice the same change write the same one).
    db.collection('cpuTierLog').doc(`${v.month}-${key.replace(/ /g, '')}-${Math.floor(now / 600_000)}`).set({
      at: now, month: v.month, levels: Object.fromEntries(([1, 2, 3] as Tier[]).map(t => [t, v.tiers[t].level])), locked: Object.fromEntries(([1, 2, 3] as Tier[]).map(t => [t, v.tiers[t].locked])),
      pressurePct: Math.round(v.pressure * 100), usedHours: Math.round(v.usedHours * 100) / 100,
    }).catch(() => {})
  }
  lastLevels = key
  void import('./usageAlerts').then(m => m.checkMeterAlerts(db, v, now)).catch(e => console.error('[usage alerts]', e))
}

/** True when reactions should do no work. Never throws: if the check fails, reactions stay on. */
export async function reactionsLocked(): Promise<boolean> {
  try { return (await cpuState()).locked } catch { return false }
}
