import 'server-only'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
  DEFAULT_CONFIG, applyDirectorSave, clipInterval, endAfter, parseClock, planAutoBlocks, sanitizeConfig,
  type AutoConfig, type Interval, type PlannedBlock, type WeeklyEntry,
} from '../autoschedule'
import { syncToAzuraCast, type SyncResult } from './azuracast'
import { buildScheduleFeed } from './scheduleFeed'
import { genreWeights } from './taste'

const CONFIG_DOC = ['config', 'autoScheduler'] as const

// Read by the schedule, the player and the vote card on almost every request, so kept for 20 s per server instance
// (saveConfig below clears it on this instance at once).
let configCache: { at: number; value: Promise<AutoConfig> } | null = null

export function loadConfig(db: Firestore): Promise<AutoConfig> {
  if (configCache && Date.now() - configCache.at < 20_000) return configCache.value.then(c => structuredClone(c))
  const value = db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).get().then(snap => (snap.exists ? sanitizeConfig(snap.data()) : DEFAULT_CONFIG))
  const entry = { at: Date.now(), value }
  configCache = entry
  value.catch(() => { if (configCache === entry) configCache = null })
  return value.then(c => structuredClone(c))
}

export async function saveConfig(db: Firestore, raw: unknown, uid: string): Promise<AutoConfig> {
  const cfg = sanitizeConfig(raw)
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).set({ ...cfg, updatedAt: Timestamp.now(), updatedBy: uid })
  configCache = null
  return cfg
}

/**
 * The save used by POST /api/admin/autoschedule. The saved document is read again inside the transaction, so a Director's save is merged onto
 * what is stored right now (only rules and defaultFillers come from the request) and can never put back an old Admin-only value.
 * An Admin's save replaces the whole config as before. Returns the config as it was and as it is now.
 */
export async function saveConfigAs(db: Firestore, raw: unknown, who: { uid: string; admin: boolean }): Promise<{ before: AutoConfig; after: AutoConfig }> {
  const ref = db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1])
  const r = await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const before = snap.exists ? sanitizeConfig(snap.data()) : DEFAULT_CONFIG
    const after = who.admin ? sanitizeConfig(raw) : applyDirectorSave(before, raw)
    tx.set(ref, { ...after, updatedAt: Timestamp.now(), updatedBy: who.uid })
    return { before, after }
  })
  configCache = null
  return r
}

/**
 * The album-art colour switch (auto.colorChanging) on its own. E-board can flip this one value; the write touches only this field (and who and when),
 * so nothing else in the Auto DJ config can change through it. Returns the old and new value.
 */
export async function setColorMode(db: Firestore, on: boolean, uid: string): Promise<{ before: boolean; after: boolean }> {
  const ref = db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1])
  const r = await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const before = snap.exists ? sanitizeConfig(snap.data()).colorChanging : DEFAULT_CONFIG.colorChanging
    if (snap.exists) tx.update(ref, { colorChanging: on, updatedAt: Timestamp.now(), updatedBy: uid })
    else tx.set(ref, { ...DEFAULT_CONFIG, colorChanging: on, updatedAt: Timestamp.now(), updatedBy: uid }) // no saved config yet: start from the defaults
    return { before, after: on }
  })
  configCache = null
  return r
}

/** Recurring weekly shows from the `schedule` collection. endTime or durationMin optional; default 60 min. */
async function loadWeekly(db: Firestore): Promise<WeeklyEntry[]> {
  const snap = await db.collection('schedule').where('isActive', '==', true).get()
  return snap.docs.flatMap(d => {
    const start = parseClock(String(d.get('startTime') ?? ''))
    if (start === null || (typeof d.get('dayOfWeek') !== 'number' && d.get('repeat') !== 'dates')) return []
    const end = parseClock(String(d.get('endTime') ?? ''))
    const dur = Number(d.get('durationMin'))
    const endMin = end !== null ? endAfter(start, end) : start + (Number.isFinite(dur) && dur > 0 ? dur : 60)
    return [{ dow: (d.get('dayOfWeek') as number | undefined) ?? 0, startMin: start, endMin, rep: { repeat: d.get('repeat'), anchor: d.get('anchor'), weeks: d.get('weeks'), dates: d.get('dates') } }]
  })
}

export interface RunResult { blocks: PlannedBlock[]; kept: number; written: boolean; azuracast?: SyncResult }

/**
 * Rebuild the auto-scheduled filler blocks for the next `horizonHours`.
 * Blocks that start within `lockMinutes` (or already started) are kept so what's playing never flips.
 */
export async function rebuildAutoSchedule(db: Firestore, opts: { dryRun?: boolean; now?: number; tasteMaxAgeMs?: number } = {}): Promise<RunResult> {
  const cfg = await loadConfig(db)
  const now = opts.now ?? Date.now()
  if (!cfg.enabled) return { blocks: [], kept: 0, written: false }

  const horizonEnd = now + cfg.horizonHours * 3600_000
  const lockEdge = now + cfg.lockMinutes * 60_000

  // Existing generated blocks still in play
  const existing = await db.collection('autoBlocks').where('endAt', '>', Timestamp.fromMillis(now)).get()
  // Real bookings (student slots, one-time events, weekly shows) as concrete times.
  const real = (await buildScheduleFeed(db, { days: Math.ceil(cfg.horizonHours / 24) + 1, showStudentHosts: false, now, includeAuto: false }))
    .map(i => ({ startMs: i.startAt, endMs: i.endAt }))

  const kept: (Interval & { label: string })[] = []
  const toDelete: string[] = []
  const trimmed: { label: string; ruleId: string; startMs: number; endMs: number }[] = []
  for (const d of existing.docs) {
    const s = d.get('startAt').toMillis() as number
    const e = d.get('endAt').toMillis() as number
    // Hours won by a listener vote are never rebuilt away.
    if (s >= lockEdge && d.get('ruleId') !== 'vote') { toDelete.push(d.id); continue }
    // A block that is about to start stays, but not where something is now scheduled on top of it.
    const pieces = clipInterval({ startMs: s, endMs: e }, real)
    if (pieces.length === 1 && pieces[0].startMs === s && pieces[0].endMs === e) {
      kept.push({ startMs: s, endMs: e, label: d.get('label') })
    } else {
      toDelete.push(d.id)
      for (const p of pieces) { kept.push({ ...p, label: d.get('label') }); trimmed.push({ ...p, label: d.get('label'), ruleId: d.get('ruleId') ?? '' }) }
    }
  }
  kept.sort((a, b) => a.startMs - b.startMs)

  const busy: Interval[] = [...real, ...kept]
  const weekly = await loadWeekly(db)

  const fromMs = Math.max(now, kept.length ? kept[kept.length - 1].endMs : now)
  const taste = cfg.learn ? await genreWeights(db, cfg.timezone, opts.tasteMaxAgeMs) : { overall: {}, parts: {} }
  const blocks = planAutoBlocks({ cfg, fromMs, untilMs: horizonEnd, busy, weekly, lastLabel: kept[kept.length - 1]?.label,
    weights: taste.overall, partWeights: taste.parts })

  if (opts.dryRun) return { blocks, kept: kept.length, written: false }

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch()
    toDelete.slice(i, i + 400).forEach(id => batch.delete(db.collection('autoBlocks').doc(id)))
    await batch.commit()
  }
  for (const b of trimmed) {
    await db.collection('autoBlocks').doc(String(b.startMs)).set({
      startAt: Timestamp.fromMillis(b.startMs), endAt: Timestamp.fromMillis(b.endMs),
      label: b.label, ruleId: b.ruleId, generated: true, createdAt: Timestamp.fromMillis(now),
    })
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
