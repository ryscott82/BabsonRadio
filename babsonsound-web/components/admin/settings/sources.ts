import { api, apiGet } from '@/lib/auth'
import type { SettingValue } from '@/lib/settingRow'

// Reads and saves settings through the endpoints that already exist; what they store is unchanged.
//   limits  /api/admin/listening-limits   (GET { limits }, POST a partial { refreshSec?, budgetEnabled?, student?: {...}, guest?: {...} })
//   auto    /api/admin/autoschedule       (GET { config }, POST { config } replaces the whole config, so it is read fresh right before a save)
//   cpu     /api/admin/cpu                (GET the meter state with .config, POST only the fields that changed)
// Each save re-reads that one source and returns its values, so the page always shows what the server really stored.

export type Values = Record<string, SettingValue>
type Source = 'limits' | 'auto' | 'cpu'
const sourceOf = (id: string): Source => (id.startsWith('limits.') ? 'limits' : id.startsWith('auto.') ? 'auto' : 'cpu')

interface Audience { idleMin: number; sessionMaxMin: number; dailyCapMin: number; dailyAutoMin: number; quietEnabled: boolean; quietStart: number; quietEnd: number }
interface LimitsReply { limits: { budgetEnabled: boolean; refreshSec: number; student: Audience; guest: Audience } }
interface AutoConfig { enabled: boolean; learn: boolean; colorChanging: boolean; horizonHours: number; stepMinutes: number; maxBlockMinutes: number; lockMinutes: number; syncToAzuraCast: boolean; [k: string]: unknown }
interface CpuReply { config: { budgetHours: number; auto: boolean; nowPlayingDirect: string; directAt: number; thresholds: Record<string, { tight: number; critical: number }> } }

async function readLimits(): Promise<Values> {
  const { limits: l } = await apiGet<LimitsReply>('/api/admin/listening-limits')
  const v: Values = { 'limits.refreshSec': l.refreshSec, 'limits.budgetEnabled': l.budgetEnabled }
  for (const a of ['student', 'guest'] as const) for (const [k, x] of Object.entries(l[a])) v[`limits.${a}.${k}`] = x
  return v
}
async function readAuto(): Promise<{ values: Values; config: AutoConfig }> {
  const { config } = await apiGet<{ config: AutoConfig }>('/api/admin/autoschedule')
  const v: Values = {}
  for (const k of ['enabled', 'learn', 'colorChanging', 'horizonHours', 'maxBlockMinutes', 'lockMinutes', 'syncToAzuraCast'] as const) v[`auto.${k}`] = config[k] as SettingValue
  v['auto.stepMinutes'] = String(config.stepMinutes)
  return { values: v, config }
}
async function readCpu(): Promise<{ values: Values; config: CpuReply['config'] }> {
  const { config: c } = await apiGet<CpuReply>('/api/admin/cpu')
  const v: Values = { 'cpu.budgetHours': c.budgetHours, 'cpu.auto': c.auto, 'cpu.nowPlayingDirect': c.nowPlayingDirect, 'cpu.directAt': c.directAt }
  for (const t of ['1', '2', '3']) for (const s of ['tight', 'critical'] as const) v[`cpu.th.${t}.${s}`] = c.thresholds[t][s]
  return { values: v, config: c }
}

/** Reads all three sources at once. A source that fails is reported by name, and its rows stay unloaded (never shown as changed). */
export async function loadAll(): Promise<{ values: Values; failed: string[] }> {
  const [a, b, c] = await Promise.allSettled([readLimits(), readAuto(), readCpu()])
  const values: Values = {}
  const failed: string[] = []
  if (a.status === 'fulfilled') Object.assign(values, a.value); else failed.push('Listening limits')
  if (b.status === 'fulfilled') Object.assign(values, b.value.values); else failed.push('Auto DJ')
  if (c.status === 'fulfilled') Object.assign(values, c.value.values); else failed.push('Server time')
  return { values, failed }
}

/** Saves one setting and returns the fresh values of the source it belongs to. Throws the server's message when it refuses. */
export async function saveOne(id: string, value: SettingValue): Promise<Values> {
  const src = sourceOf(id)
  if (src === 'limits') {
    const [, a, k] = id.split('.')
    await api('/api/admin/listening-limits', k ? { [a]: { [k]: value } } : { [a]: value })
    return readLimits()
  }
  if (src === 'auto') {
    const k = id.slice('auto.'.length)
    const { config } = await readAuto() // fresh, because the POST replaces the whole config
    await api('/api/admin/autoschedule', { config: { ...config, [k]: k === 'stepMinutes' ? Number(value) : value } })
    return (await readAuto()).values
  }
  const { config } = await readCpu()
  if (id.startsWith('cpu.th.')) {
    const [, , tier, step] = id.split('.')
    await api('/api/admin/cpu', { thresholds: { [tier]: { ...config.thresholds[tier], [step]: value } } })
  } else {
    await api('/api/admin/cpu', { [id.slice('cpu.'.length)]: value })
  }
  return (await readCpu()).values
}
