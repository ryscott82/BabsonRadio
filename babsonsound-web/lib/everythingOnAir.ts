// "Everything on air" on the admin Schedule page: weekly shows, one-time events, approved student shows, requests that are still pending (labeled
// "pending") and Auto DJ, in one list by day. Pure (no React, no fetch) so the tests can read it.

export type OnAirKind = 'weekly' | 'event' | 'approved' | 'pending' | 'auto'
export interface FeedItem { id: string; source: 'weekly' | 'slot' | 'auto' | 'event'; title: string; hosts: string[]; startAt: number; endAt: number; format: string }
export interface PendingItem { id: string; title: string; requesterName: string; startAt: number; durationMin: number; held?: boolean; type?: string }
export interface OnAirRow { key: string; kind: OnAirKind; title: string; who: string; startAt: number; endAt: number; note: string }

export const KIND_LABEL: Record<OnAirKind, string> = { weekly: 'Weekly show', event: 'One-time event', approved: 'Student show', pending: 'Pending', auto: 'Auto DJ' }
export const KINDS: OnAirKind[] = ['weekly', 'event', 'approved', 'pending', 'auto']

const kindOf = (s: FeedItem['source']): OnAirKind => (s === 'weekly' ? 'weekly' : s === 'event' ? 'event' : s === 'auto' ? 'auto' : 'approved')

/** One sorted list. A pending request is labeled "pending" and says whether it is on hold. */
export function mergeOnAir(feed: FeedItem[], pending: PendingItem[], now: number): OnAirRow[] {
  const rows: OnAirRow[] = [
    ...feed.filter(i => i.endAt > now).map(i => ({ key: `${i.source}:${i.id}:${i.startAt}`, kind: kindOf(i.source), title: i.title, who: i.hosts.join(', '), startAt: i.startAt, endAt: i.endAt, note: '' })),
    ...pending.filter(p => p.startAt + p.durationMin * 60_000 > now).map(p => ({ key: `pending:${p.id}`, kind: 'pending' as const, title: p.title, who: p.requesterName, startAt: p.startAt, endAt: p.startAt + p.durationMin * 60_000, note: p.held ? 'on hold' : 'pending' })),
  ]
  return rows.sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt)
}

export const filterKinds = (rows: OnAirRow[], on: Set<OnAirKind>) => rows.filter(r => on.has(r.kind))

export function groupByDay(rows: OnAirRow[], tz = 'America/New_York'): { day: string; rows: OnAirRow[] }[] {
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
  const out: { day: string; rows: OnAirRow[] }[] = []
  for (const r of rows) {
    const day = fmt(r.startAt)
    const last = out[out.length - 1]
    if (last && last.day === day) last.rows.push(r)
    else out.push({ day, rows: [r] })
  }
  return out
}
