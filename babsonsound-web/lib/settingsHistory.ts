import type { SettingValue } from './settingRow.ts'

// The History panel at the bottom of Admin > Settings: newest first, a page at a time. Loaded only when the panel is opened.
// GET /api/admin/settings/history?limit=50&before=<at>  ->  { lines, next }  (pass `next` back as `before` for the following page; null = the end)

export interface HistoryLine { id: string; at: number; by: string; key: string; label: string; old: SettingValue; new: SettingValue }
export interface HistoryPage { lines: HistoryLine[]; next: number | null }
export const PAGE_SIZE = 50

export function historyUrl(before: number | null, limit = PAGE_SIZE): string {
  return `/api/admin/settings/history?limit=${limit}${before ? `&before=${before}` : ''}`
}

/** Adds a page to what is already shown. A line that arrives twice (two changes in the same millisecond straddle a page edge) is kept once. */
export function mergePage(shown: HistoryLine[], page: HistoryPage): HistoryLine[] {
  const seen = new Set(shown.map(l => l.id))
  return [...shown, ...page.lines.filter(l => !seen.has(l.id))]
}

/** "30 -> 60" in words a person reads; unknown values show as text. */
export function describeValue(v: SettingValue): string {
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  return String(v)
}
export const describeChange = (l: HistoryLine) => `${describeValue(l.old)} to ${describeValue(l.new)}`

/** Whether the panel should offer "Show older". */
export const hasMore = (next: number | null) => next !== null
