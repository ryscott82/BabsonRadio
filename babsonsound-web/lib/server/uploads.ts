import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { cpuState } from './cpuBudget'
import { DEFAULT_UPLOAD_LIMITS, EMPTY_USAGE, MB, dayKey, judgeChunk, monthKey, type UploadLimits, type UploadUsage, type Verdict } from '../uploads'

// Counts every piece of every music upload (data and calls, per month and per day) so uploads can never use up the site's free-plan allowance.
//   uploadUsage/{YYYY-MM}   { bytes, calls, files, d: { 'YYYY-MM-DD': bytes } }
//   usage/uploadLimits      the caps an admin can change

const limitsRef = (db: Firestore) => db.collection('usage').doc('uploadLimits')
const usageRef = (db: Firestore, now: number) => db.collection('uploadUsage').doc(monthKey(now))

export async function loadUploadLimits(db: Firestore): Promise<UploadLimits> {
  const d = (await limitsRef(db).get()).data() ?? {}
  const n = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : def)
  const D = DEFAULT_UPLOAD_LIMITS
  return {
    enabled: d.enabled !== false,
    monthlyMB: n(d.monthlyMB, D.monthlyMB, 1, 1_000_000),
    dailyMB: n(d.dailyMB, D.dailyMB, 1, 1_000_000),
    monthlyCalls: n(d.monthlyCalls, D.monthlyCalls, 1, 10_000_000),
    maxFileMB: n(d.maxFileMB, D.maxFileMB, 1, 500),
    pauseAtCpuPct: n(d.pauseAtCpuPct, D.pauseAtCpuPct, 10, 200),
  }
}

export async function saveUploadLimits(db: Firestore, patch: Partial<UploadLimits>): Promise<void> {
  await limitsRef(db).set(patch, { merge: true })
}

function usageFrom(data: FirebaseFirestore.DocumentData | undefined, now: number): UploadUsage {
  const u = EMPTY_USAGE(monthKey(now))
  if (!data) return u
  u.bytes = Number(data.bytes) || 0
  u.calls = Number(data.calls) || 0
  u.files = Number(data.files) || 0
  u.todayBytes = Number((data.d ?? {})[dayKey(now)]) || 0
  return u
}

/** The site's server-time use as a percent of its monthly allowance. */
async function cpuPct(db: Firestore): Promise<number> {
  try { const c = await cpuState(db); return c.config.budgetHours > 0 ? (c.usedHours / c.config.budgetHours) * 100 : 0 } catch { return 0 }
}

export interface UploadState { limits: UploadLimits; usage: UploadUsage; cpuPct: number; byDayMB: Record<string, number> }

export async function uploadState(db: Firestore, now = Date.now()): Promise<UploadState> {
  const [limits, snap, cpu] = await Promise.all([loadUploadLimits(db), usageRef(db, now).get(), cpuPct(db)])
  const byDayMB: Record<string, number> = {}
  for (const [k, v] of Object.entries((snap.get('d') ?? {}) as Record<string, number>)) byDayMB[k] = Math.round((Number(v) / MB) * 10) / 10
  return { limits, usage: usageFrom(snap.data(), now), cpuPct: Math.round(cpu * 10) / 10, byDayMB }
}

/** Checks the limits and, if the piece may go through, counts it, in one step so two uploads cannot both squeeze under the same limit. */
export async function reserveChunk(db: Firestore, chunkBytes: number, fileBytes: number, firstPiece: boolean, now = Date.now()): Promise<Verdict> {
  const [limits, cpu] = await Promise.all([loadUploadLimits(db), cpuPct(db)])
  return db.runTransaction(async tx => {
    const ref = usageRef(db, now)
    const snap = await tx.get(ref)
    const verdict = judgeChunk(usageFrom(snap.data(), now), limits, chunkBytes, fileBytes, cpu)
    if (verdict.ok) {
      tx.set(ref, { bytes: FieldValue.increment(chunkBytes), calls: FieldValue.increment(1), files: FieldValue.increment(firstPiece ? 1 : 0), d: { [dayKey(now)]: FieldValue.increment(chunkBytes) } }, { merge: true })
    }
    return verdict
  })
}

/** A short record of who uploaded or removed what. */
export async function logMedia(db: Firestore, by: string, action: 'upload' | 'delete' | 'playlists', detail: string): Promise<void> {
  await db.collection('mediaLog').add({ by, action, detail: detail.slice(0, 300), at: Date.now() }).catch(() => {})
}
