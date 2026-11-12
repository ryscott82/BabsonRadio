import { autoLine, type AutoInfo } from './slotWording.ts'

// The Today page: what each part shows, in plain words. Pure (no React, no fetch), so the tests can check it. The page itself reads ONE call,
// GET /api/admin/dashboard, every 60 seconds while the tab is visible (see startPolling), and shows nothing else until a control is opened.

export type PendingFlag = 'explicit' | 'minor' | 'cleanHours' | 'agreementUnsigned' | 'conflict'
export interface PendingRow extends AutoInfo {
  id: string; title: string; hostName: string; hostUid?: string; startAt: number; durationMin: number; type: string; flags: PendingFlag[]
  /** Confirmed strikes this semester (0 to 3), for the small standing flag. */
  strikes?: number
}
export interface NextRow { title: string; startAt: number; endAt: number; source: string; hostName?: string; hostEmail?: string }
export interface Critical { siteDown: boolean; deadAir: boolean; serverTime: 'ok' | 'critical' | 'over' }

/** Only student-run shows are listed on the home page; Auto DJ blocks are not. */
export const studentShows = (rows: readonly NextRow[]): NextRow[] => rows.filter(r => r.source !== 'auto')

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

/** Only these flags stop a request approving itself. The others (explicit words, a minor, clean hours) are things to look at, not blocks. */
const BLOCKING: PendingFlag[] = ['agreementUnsigned', 'conflict']
export const blockingFlags = (flags: PendingFlag[]) => flags.filter(f => BLOCKING.includes(f))
export const noteFlags = (flags: PendingFlag[]) => flags.filter(f => !BLOCKING.includes(f))

/** "3 hours", "40 minutes", "2 days". */
export function inWords(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return `${d} days`
}

export interface Waiting { auto: boolean; text: string }
/**
 * What a pending request is waiting for. `auto: true` means it will approve itself ("Auto approved in 5 hours"); nothing to do unless you want to
 * decide first. `auto: false` means a person has to decide: it is held, or something blocks automatic approval (and the reason is in words).
 */
export function waitingFor(r: PendingRow, now: number): Waiting {
  if (r.held) return { auto: false, text: 'Held: it will not approve itself' }
  const block = blockingFlags(r.flags)
  if (block.length) return { auto: false, text: `Needs hand review: ${flagWords(block).join(', ')}` }
  if (r.autoBlockedReason || typeof r.autoApproveAt !== 'number') {
    const line = autoLine(r, now, () => '')
    return { auto: false, text: line.startsWith('Waiting for staff') ? `Needs hand review${line.slice('Waiting for staff'.length)}` : 'Needs hand review' }
  }
  return r.autoApproveAt > now ? { auto: true, text: `Auto approved in ${inWords(r.autoApproveAt - now)}` } : { auto: true, text: 'Auto approved soon' }
}
/** The "check this" note for flags that do not block automatic approval, or an empty string. */
export const noteLine = (r: PendingRow) => (noteFlags(r.flags).length ? `Check: ${flagWords(noteFlags(r.flags)).join(', ')}` : '')
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
