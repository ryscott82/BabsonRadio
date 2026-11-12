// What the Today page gets from GET /api/admin/dashboard. Pure (no database), so the tests can check exactly what is sent and, above all, that no phone
// number is ever in it. Every object here is built field by field from a short list; nothing is spread from a stored document.

export type PendingFlag = 'explicit' | 'minor' | 'cleanHours' | 'agreementUnsigned' | 'conflict'

export interface PendingSource {
  id: string; title: string; description: string; location: string
  requesterName: string; requesterUid: string
  startAt: number; durationMin: number; type: string
  autoApproveAt: number | null; autoBlockedReason: string; held: boolean
  cleanHours: boolean; conductSigned: boolean | null
}
export interface PendingRow {
  id: string; title: string; hostName: string; hostUid: string; startAt: number; durationMin: number; type: string
  autoApproveAt: number | null; autoBlockedReason: string; held: boolean; flags: PendingFlag[]
  /** Confirmed strikes this semester (0 to 3). The count only: no reasons, no names of anything else. */
  strikes: number
}

/** Most pending requests sent in the one dashboard call. The page shows `pendingTotal` for the rest. */
export const PENDING_MAX = 20

export function pendingFlags(i: { explicit: boolean; minor: boolean; cleanHours: boolean; conductSigned: boolean | null; autoBlockedReason: string }): PendingFlag[] {
  const f: PendingFlag[] = []
  if (i.explicit) f.push('explicit')
  if (i.minor) f.push('minor')
  if (i.cleanHours) f.push('cleanHours')
  if (i.conductSigned === false || i.autoBlockedReason === 'agreement') f.push('agreementUnsigned')
  if (i.autoBlockedReason === 'conflict') f.push('conflict')
  return f
}

/** Soonest first, at most PENDING_MAX rows, each with only the listed fields. `explicitOf` and `minorOf` look at the text and the requester. */
export function shapePending(src: PendingSource[], explicitOf: (text: string) => boolean, minorOf: (uid: string) => boolean, strikesOf: (uid: string) => number = () => 0): { rows: PendingRow[]; total: number } {
  const rows = [...src].sort((a, b) => a.startAt - b.startAt).slice(0, PENDING_MAX).map(s => ({
    id: s.id, title: s.title, hostName: s.requesterName, hostUid: s.requesterUid, startAt: s.startAt, durationMin: s.durationMin, type: s.type,
    autoApproveAt: s.autoApproveAt, autoBlockedReason: s.autoBlockedReason, held: s.held, strikes: strikesOf(s.requesterUid),
    flags: pendingFlags({ explicit: explicitOf(`${s.title} ${s.description} ${s.location}`), minor: minorOf(s.requesterUid), cleanHours: s.cleanHours, conductSigned: s.conductSigned, autoBlockedReason: s.autoBlockedReason }),
  }))
  return { rows, total: src.length }
}

export interface NextItem { id: string; title: string; startAt: number; endAt: number; source: string; hosts?: string[] }
export interface HostInfo { name: string; email: string }
export interface NextRow { title: string; startAt: number; endAt: number; source: string; hostName?: string; hostEmail?: string }

function nextRow(i: NextItem, hosts: ReadonlyMap<string, HostInfo>): NextRow {
  const row: NextRow = { title: i.title, startAt: i.startAt, endAt: i.endAt, source: i.source }
  if (i.source === 'auto') return row
  const h = i.id.startsWith('slot-') ? hosts.get(i.id.slice(5)) : undefined
  const name = h?.name || (i.hosts ?? []).join(', ')
  if (name) row.hostName = name
  if (h?.email) row.hostEmail = h.email
  return row
}

/** The next 24 hours. Only a real show (anything that is not an Auto DJ block) carries `hostName`, and `hostEmail` only when a request on file has one. */
export function shapeNext(items: NextItem[], hosts: ReadonlyMap<string, HostInfo>, now: number, max = 12): NextRow[] {
  return items.filter(i => i.endAt > now && i.startAt < now + 86_400_000).sort((a, b) => a.startAt - b.startAt).slice(0, max).map(i => nextRow(i, hosts))
}

/** Coming up on the home page: at least the next 10 student shows however far away (every one in the next 24 hours if there are more), at most 30. No Auto DJ blocks. */
export const UPCOMING_MIN = 10
export const UPCOMING_MAX = 30
export function upcomingItems(items: NextItem[], now: number): NextItem[] {
  const real = items.filter(i => i.source !== 'auto' && i.endAt > now).sort((a, b) => a.startAt - b.startAt)
  const inDay = real.filter(i => i.startAt < now + 86_400_000).length
  return real.slice(0, Math.min(UPCOMING_MAX, Math.max(UPCOMING_MIN, inDay)))
}
export const shapeUpcoming = (items: NextItem[], hosts: ReadonlyMap<string, HostInfo>, now: number): NextRow[] => upcomingItems(items, now).map(i => nextRow(i, hosts))

export type ServerTime = 'ok' | 'critical' | 'over'
export interface Critical { siteDown: boolean; deadAir: boolean; serverTime: ServerTime }

/**
 * The strip at the top of Today. All three come from what the dashboard already reads:
 *  - siteDown: the stream server is set up but the now-playing read came back empty (it could not be reached).
 *  - deadAir: the dead-air monitor says the stream is silent right now.
 *  - serverTime: 'over' at or past the month's allowance, 'critical' at 90% or when any tier is at its critical level.
 */
export function criticalOf(i: { configured: boolean; npTitle: string; npPlayedAt: number; deadAirActive: boolean; usage: { pct: number; overall: string } | null }): Critical {
  const siteDown = i.configured && !i.npTitle && !i.npPlayedAt
  const u = i.usage
  const serverTime: ServerTime = !u ? 'ok' : u.pct >= 100 ? 'over' : u.overall === 'critical' || u.pct >= 90 ? 'critical' : 'ok'
  return { siteDown, deadAir: i.deadAirActive, serverTime }
}
