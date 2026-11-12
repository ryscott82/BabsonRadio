import 'server-only'
import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from './admin'
import { loadLimits, saveLimits } from './listenLimits'
import { loadCpuConfig, resetCpuCache } from './cpuBudget'
import { resetUsageStatus } from './serverUsage'
import { loadConfig, saveConfig } from './autoschedule'
import { loadSlotRules, resetSlotRules } from './slotRules'
import { loadStudioRules, resetStudioRules, STUDIO_DOC } from './studioRules'
import { SETTINGS, clipLog, planPatch, readValue, type Change, type SettingDef, type Store, type Value } from '../adminSettings'

// Admin > Settings in one call: GET reads every value, PATCH saves some of them and writes one small line per changed value to settingsLog.
// Values are saved to the same documents the older admin pages use (usage/limits, usage/cpuConfig, config/autoScheduler).
// The last change of each key (who, when) sits in one document, config/settingsMeta, so "changed from default" needs no query.

const META = (db: Firestore) => db.collection('config').doc('settingsMeta')

export interface SettingRow extends SettingDef { value: Value; changed: boolean; changedAt: number | null; changedBy: string | null }

async function currentDocs(db: Firestore) {
  const [limits, cpu, auto, slots, studio, meta] = await Promise.all([loadLimits(db), loadCpuConfig(db), loadConfig(db), loadSlotRules(db), loadStudioRules(db), META(db).get()])
  return { docs: { limits, cpu, auto, slots, studio } as Record<Store, unknown>, meta: (meta.get('m') ?? {}) as Record<string, { at?: number; by?: string }> }
}

export const valuesOf = (docs: Record<Store, unknown>): Record<string, Value> => Object.fromEntries(SETTINGS.map(s => [s.key, readValue(s, docs[s.store])]))

export async function loadSettings(db: Firestore = adminDb()): Promise<SettingRow[]> {
  const { docs, meta } = await currentDocs(db)
  const v = valuesOf(docs)
  return SETTINGS.map(s => ({
    ...s, value: v[s.key], changed: v[s.key] !== s.default,
    changedAt: typeof meta[s.key]?.at === 'number' ? meta[s.key].at! : null, changedBy: meta[s.key]?.by ?? null,
  }))
}

/** One small line per changed value, and the latest change of each key, in a single batch. Used by PATCH and by the older pages' saves. */
export async function logSettingChanges(db: Firestore, changes: Change[], who: string, at = Date.now()) {
  if (!changes.length) return
  const batch = db.batch()
  for (const c of changes) batch.set(db.collection('settingsLog').doc(), clipLog(c, who, at))
  batch.set(META(db), { m: Object.fromEntries(changes.map(c => [c.key, { at, by: who.slice(0, 120) }])) }, { merge: true })
  await batch.commit()
}

const nest = (changes: Change[], store: Store) => {
  const out: Record<string, unknown> = {}
  for (const c of changes) {
    const def = SETTINGS.find(s => s.key === c.key)!
    if (def.store !== store) continue
    let o = out
    for (const p of def.path.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>
    o[def.path[def.path.length - 1]] = c.new
  }
  return out
}

/** Saves a patch. Throws { errors } style messages as a single Error text for the route to turn into a 400. */
export async function patchSettings(patch: unknown, uid: string, who: string, db: Firestore = adminDb()): Promise<{ rows: SettingRow[]; changed: string[] }> {
  const { docs } = await currentDocs(db)
  const { changes, errors } = planPatch(valuesOf(docs), patch)
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { status: 400 })
  if (!changes.length) return { rows: await loadSettings(db), changed: [] }

  const lim = nest(changes, 'limits'), cpu = nest(changes, 'cpu'), auto = nest(changes, 'auto'), slots = nest(changes, 'slots'), studio = nest(changes, 'studio')
  if (Object.keys(lim).length) await saveLimits(lim, uid)
  if (Object.keys(cpu).length) {
    await db.collection('usage').doc('cpuConfig').set(cpu, { merge: true })
    resetCpuCache(); resetUsageStatus()
  }
  if (Object.keys(auto).length) await saveConfig(db, { ...(docs.auto as object), ...auto }, uid)
  if (Object.keys(slots).length) {
    await db.collection('config').doc('slotRules').set({ ...slots, updatedAt: Date.now(), updatedBy: uid }, { merge: true })
    resetSlotRules()
  }
  if (Object.keys(studio).length) {
    await db.collection(STUDIO_DOC[0]).doc(STUDIO_DOC[1]).set({ ...studio, updatedAt: Date.now(), updatedBy: uid }, { merge: true })
    resetStudioRules()
  }

  await logSettingChanges(db, changes, who)
  return { rows: await loadSettings(db), changed: changes.map(c => c.key) }
}

export interface LogLine { id: string; at: number; by: string; key: string; label: string; old: Value; new: Value }

/** Newest first. `before` (an `at` from an earlier page) continues the list. One indexed field, no composite index. */
export async function settingsHistory(limit: number, before: number | null, db: Firestore = adminDb()): Promise<{ lines: LogLine[]; next: number | null }> {
  const n = Math.min(200, Math.max(1, Math.floor(limit) || 50))
  let q = db.collection('settingsLog').orderBy('at', 'desc')
  if (before !== null) q = q.where('at', '<', before)
  const snap = await q.limit(n).get()
  const lines = snap.docs.map(d => {
    const key = String(d.get('key') ?? '')
    return { id: d.id, at: Number(d.get('at') ?? 0), by: String(d.get('by') ?? ''), key, label: SETTINGS.find(s => s.key === key)?.label ?? key, old: d.get('old') as Value, new: d.get('new') as Value }
  })
  return { lines, next: lines.length === n ? lines[lines.length - 1].at : null }
}
