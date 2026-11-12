// What a pending show request says about its automatic approval. Used by Admin > Slots (staff) and My shows (the student), so both read the same.
// The fields come from the server: held, autoApproveAt (ms, null once it is held or blocked), autoBlockedReason, autoEligible (staff view only).

export interface AutoInfo {
  held?: boolean
  autoApproveAt?: number | null
  autoBlockedReason?: string | null
  autoEligible?: boolean
}

export type AutoState = 'held' | 'scheduled' | 'due' | 'week-limit' | 'waiting'

const REASON: Record<string, string> = {
  'week-limit': 'week limit',
  agreement: 'agreement not signed',
  training: 'radio training needed',
  conflict: 'time conflict',
  past: 'start time passed',
  ineligible: 'not eligible',
}

/** Which of the five situations a pending request is in. A hold always wins; a blocked reason wins over the clock. */
export function autoState(i: AutoInfo, now: number): AutoState {
  if (i.held) return 'held'
  if (i.autoBlockedReason === 'week-limit') return 'week-limit'
  if (i.autoBlockedReason) return 'waiting'
  if (i.autoEligible === false) return 'waiting'
  if (typeof i.autoApproveAt === 'number') return i.autoApproveAt > now ? 'scheduled' : 'due'
  return 'waiting'
}

/** The line shown on the card. `fmt` formats a time the way the page does. */
export function autoLine(i: AutoInfo, now: number, fmt: (ms: number) => string): string {
  switch (autoState(i, now)) {
    case 'held': return 'Held'
    case 'week-limit': return 'Waiting for staff (week limit)'
    case 'scheduled': return `Approves automatically on ${fmt(i.autoApproveAt as number)}`
    case 'due': return 'Approves automatically soon'
    default: {
      const why = i.autoBlockedReason ? REASON[i.autoBlockedReason] : ''
      return why ? `Waiting for staff (${why})` : 'Waiting for staff'
    }
  }
}

/** One more sentence for the person reading it. Staff see what Hold does; the student sees why nothing is happening. */
export function autoHelp(i: AutoInfo, now: number, who: 'staff' | 'student'): string {
  const s = autoState(i, now)
  if (s === 'held') return who === 'staff' ? 'It will not approve itself until you release the hold.' : 'Staff are keeping this one to review it themselves.'
  if (s === 'week-limit') return who === 'staff' ? 'This person already has their automatic show this week. Approve it yourself if you want it.' : 'You already have an automatically approved show this week, so staff will review this one.'
  if (s === 'scheduled' || s === 'due') return who === 'staff' ? 'Hold it if you want to decide yourself.' : ''
  return who === 'staff' ? 'It will not approve itself. Approve or decline it.' : 'Staff will review this request.'
}

/** What the Hold button sends. */
export const holdBody = (requestId: string, hold: boolean, note = '') => ({ requestId, hold, note })
export const holdLabel = (held: boolean) => (held ? 'Release hold' : 'Hold')
