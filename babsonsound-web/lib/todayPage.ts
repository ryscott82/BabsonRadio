import { autoLine, type AutoInfo } from './slotWording.ts'

// The Today page: what each part shows, in plain words. Pure (no React, no fetch), so the tests can check it. The page itself reads ONE call,
// GET /api/admin/dashboard, every 60 seconds while the tab is visible (see startPolling), and shows nothing else until a control is opened.

export type PendingFlag = 'explicit' | 'minor' | 'cleanHours' | 'agreementUnsigned' | 'conflict'
export interface PendingRow extends AutoInfo {
  id: string; title: string; hostName: string; startAt: number; durationMin: number; type: string; flags: PendingFlag[]
}
export interface NextRow { title: string; startAt: number; endAt: number; source: string; hostName?: string; hostEmail?: string }
export interface Critical { siteDown: boolean; deadAir: boolean; serverTime: 'ok' | 'critical' | 'over' }

export const POLL_MS = 60_000
export const DASHBOARD_URL = '/api/admin/dashboard'

// ── polling ──
export interface PollEnv {
  hidden(): boolean
  every(fn: () => void, ms: number): () => void // returns a stop function
}
/** Calls `load` once now, then every 60 seconds, but only while the tab is visible. Never faster. Returns a stop function. */
export function startPolling(load: () => void, env: PollEnv): () => void {
  if (!env.hidden()) load()
  return env.every(() => { if (!env.hidden()) load() }, POLL_MS)
}

// ── critical strip ──
export interface CriticalLine { text: string; href: string | null }
/** One line per true condition. Nothing at all (an empty list) when everything is fine: the strip then renders nothing. */
export function criticalLines(c: Critical | null | undefined, role: 'director' | 'admin'): CriticalLine[] {
  if (!c) return []
  const lines: CriticalLine[] = []
  if (c.siteDown) lines.push({ text: 'The radio stream cannot be reached.', href: null })
  if (c.deadAir) lines.push({ text: 'Dead air: the stream has gone silent.', href: null })
  if (c.serverTime === 'over') lines.push({ text: 'Server time is over the monthly allowance. The site can be paused.', href: role === 'admin' ? '/admin/server-load' : null })
  else if (c.serverTime === 'critical') lines.push({ text: 'Server time is almost used up for the month.', href: role === 'admin' ? '/admin/server-load' : null })
  return lines
}

// ── needs approval ──
export const FLAG_WORDS: Record<PendingFlag, string> = {
  explicit: 'explicit words', minor: 'host is a minor', cleanHours: 'clean-hours show', agreementUnsigned: 'agreement not signed', conflict: 'time conflict',
}
export const flagWords = (flags: PendingFlag[]) => flags.map(f => FLAG_WORDS[f])

/** Why this request is still waiting: a person must look at it, or when it approves itself. */
export function whyWaiting(r: PendingRow, now: number, fmt: (ms: number) => string): string {
  if (r.flags.length) return `Needs hand review: ${flagWords(r.flags).join(', ')}`
  if (r.held) return 'Held: needs hand review'
  const line = autoLine(r, now, fmt)
  return line.startsWith('Approves automatically on ') ? `Approves itself ${line.slice('Approves automatically on '.length)}` : line === 'Approves automatically soon' ? 'Approves itself soon' : line
}
export const isFlagged = (r: PendingRow) => r.flags.length > 0

/** What Approve all sends: exactly the ids that were listed in the confirm box, in the order shown. Nothing else. */
export const approveAllBody = (rows: Pick<PendingRow, 'id'>[]) => ({ ids: rows.map(r => r.id) })
export const approveAllLabel = (n: number) => `Approve ${n} request${n === 1 ? '' : 's'}`

export interface ApproveResultRow { id: string; ok: boolean; reason?: string }
/** Result lines in the order of the list that was confirmed. A request the server did not mention is reported as skipped. */
export function resultLines(rows: Pick<PendingRow, 'id' | 'title'>[], results: ApproveResultRow[]): { id: string; title: string; text: string; ok: boolean }[] {
  const by = new Map(results.map(r => [r.id, r]))
  return rows.map(r => {
    const x = by.get(r.id)
    return x?.ok ? { id: r.id, title: r.title, ok: true, text: 'Approved' } : { id: r.id, title: r.title, ok: false, text: `Skipped: ${x?.reason ?? 'no answer from the server'}` }
  })
}

// ── coming up ──
/** Only the host's email is ever offered (to copy). Nothing else about a host is in the dashboard response, and nothing else is shown. */
export const hostLine = (n: NextRow) => (n.source === 'auto' ? '' : n.hostName ?? '')
export const canCopyEmail = (n: NextRow) => n.source !== 'auto' && !!n.hostEmail

/** More requests than the list holds: the page says so, because Approve all only covers the ones shown. */
export const moreWaiting = (total: number, shown: number) => Math.max(0, total - shown)
