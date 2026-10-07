import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
  DEFAULT_CONFIG, parseClock, planAutoBlocks, sanitizeConfig,
  type AutoConfig, type Interval, type PlannedBlock, type WeeklyEntry,
} from '../autoschedule'
import { syncToAzuraCast, type SyncResult } from './azuracast'

const CONFIG_DOC = ['config', 'autoScheduler'] as const

export async function loadConfig(db: Firestore): Promise<AutoConfig> {
  const snap = await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).get()
  return snap.exists ? sanitizeConfig(snap.data()) : DEFAULT_CONFIG
}

export async function saveConfig(db: Firestore, raw: unknown, uid: string): Promise<AutoConfig> {
  const cfg = sanitizeConfig(raw)
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).set({ ...cfg, updatedAt: Timestamp.now(), updatedBy: uid })
  return cfg
}

/** Recurring weekly shows from the `schedule` collection. endTime or durationMin optional; default 60 min. */
async function loadWeekly(db: Firestore): Promise<WeeklyEntry[]> {
  const snap = await db.collection('schedule').where('isActive', '==', true).get()
  return snap.docs.flatMap(d => {
    const start = parseClock(String(d.get('startTime') ?? ''))
    if (start === null || typeof d.get('dayOfWeek') !== 'number') return []
    const end = parseClock(String(d.get('endTime') ?? ''))
    const dur = Number(d.get('durationMin'))
    const endMin = end !== null && end > start ? end : start + (Number.isFinite(dur) && dur > 0 ? dur : 60)
    return [{ dow: d.get('dayOfWeek') as number, startMin: start, endMin }]
  })
}

export interface RunResult { blocks: PlannedBlock[]; kept: number; written: boolean; azuracast?: SyncResult }

/**
 * Rebuild the auto-scheduled filler blocks for the next `horizonHours`.
 * Blocks that start within `lockMinutes` (or already started) are kept so what's playing never flips.
 */
export async function rebuildAutoSchedule(db: Firestore, opts: { dryRun?: boolean; now?: number } = {}): Promise<RunResult> {
  const cfg = await loadConfig(db)
  const now = opts.now ?? Date.now()
  if (!cfg.enabled) return { blocks: [], kept: 0, written: false }

  const horizonEnd = now + cfg.horizonHours * 3600_000
  const lockEdge = now + cfg.lockMinutes * 60_000

  // Existing generated blocks still in play
  const existing = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).get()
  const kept: (Interval & { label: string })[] = []
  const toDelete: string[] = []
  for (const d of existing.docs) {
    const s = d.get('startAt').toMillis() as number
    const e = d.get('endAt').toMillis() as number
    if (s < lockEdge) kept.push({ startMs: s, endMs: e, label: d.get('label') })
    else toDelete.push(d.id)
  }
  kept.sort((a, b) => a.startMs - b.startMs)

  // Real bookings
  const slots = await db.collection('airSlots').where('endAt', '>', Timestamp.fromMillis(now)).get()
  const busy: Interval[] = [
    ...slots.docs.map(d => ({ startMs: d.get('startAt').toMillis() as number, endMs: d.get('endAt').toMillis() as number })),
    ...kept,
  ]
  const weekly = await loadWeekly(db)

  const fromMs = Math.max(now, kept.length ? kept[kept.length - 1].endMs : now)
  const blocks = planAutoBlocks({ cfg, fromMs, untilMs: horizonEnd, busy, weekly, lastLabel: kept[kept.length - 1]?.label })

  if (opts.dryRun) return { blocks, kept: kept.length, written: false }

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch()
    toDelete.slice(i, i + 400).forEach(id => batch.delete(db.collection('autoBlocks').doc(id)))
    await batch.commit()
  }
  for (let i = 0; i < blocks.length; i += 400) {
    const batch = db.batch()
    blocks.slice(i, i + 400).forEach(b => batch.set(db.collection('autoBlocks').doc(String(b.startMs)), {
      startAt: Timestamp.fromMillis(b.startMs), endAt: Timestamp.fromMillis(b.endMs),
      label: b.label, ruleId: b.ruleId, generated: true, createdAt: Timestamp.fromMillis(now),
    }))
    await batch.commit()
  }
  const azuracast = cfg.syncToAzuraCast ? await syncToAzuraCast(db, cfg, now) : undefined
  return { blocks, kept: kept.length, written: true, azuracast }
}
