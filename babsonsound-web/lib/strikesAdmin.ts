// The E-board side of strikes, studio lists and club events: wording and small rules, with no React so the tests can read them.

/** The small flag on a Users row or a request row: '' for good standing. `level` is 0 to 3 (3 = banned). */
export function standingFlag(level: number, bannedUntil?: number | null, now: number = Date.now()): string {
  if (level >= 3 || (typeof bannedUntil === 'number' && bannedUntil > now)) return 'Banned'
  if (level === 2) return 'Warning'
  if (level === 1) return '1 mistake'
  return ''
}

export interface StrikeRow { id: string; uid: string; status: string; at: number; note: string; name: string; email: string; reason: string }

export type StrikeAction = 'confirm' | 'excuse'
/** What the E-board can press: a pending flag is confirmed or excused; a confirmed strike can only be taken back (excused). */
export function strikeActions(status: string): StrikeAction[] {
  return status === 'pending' ? ['confirm', 'excuse'] : status === 'confirmed' ? ['excuse'] : []
}
export const actionLabel = (status: string, a: StrikeAction) => (a === 'confirm' ? 'Confirm' : status === 'confirmed' ? 'Take back' : 'Excuse')
export const STATUS_WORD: Record<string, string> = { pending: 'Waiting for you', confirmed: 'Confirmed', excused: 'Excused', expired: 'Ended with the semester' }

export const pendingStrikes = (rows: StrikeRow[]) => rows.filter(r => r.status === 'pending')
export const decidedStrikes = (rows: StrikeRow[]) => rows.filter(r => r.status !== 'pending')

/** A manual add needs a person (a member id from the suggestions, "u:<uid>") and a note. */
export function manualAddProblem(personId: string, note: string): string {
  if (!personId.startsWith('u:')) return 'Pick a member from the suggestions.'
  if (!note.trim()) return 'Write a short note so the E-board remembers why.'
  return ''
}
export const uidOfPerson = (personId: string) => personId.replace(/^u:/, '')

// ── studio list ──
export interface ListGuest { name: string; email: string }
export interface ListItem { kind: 'studio' | 'live' | 'prerecorded'; startAt: number; endAt: number; hostName: string; hostEmail: string; title: string; status: string; guests: ListGuest[]; justMe: boolean }
export const KIND_WORD = { studio: 'Studio booking', live: 'Live show', prerecorded: 'Pre-recorded show' } as const

/** The text the Copy button puts on the clipboard: one block per booking or show with every guest's name and email. */
export function copyText(rows: ListItem[]): string {
  const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  return rows.map(r => {
    const head = `${KIND_WORD[r.kind]}: ${r.title}, ${when(r.startAt)} (${r.hostName}${r.hostEmail ? `, ${r.hostEmail}` : ''})`
    const who = r.guests.length ? r.guests.map(g => `  ${g.name} <${g.email}>`).join('\n') : r.justMe ? '  Just the host' : '  No guest list'
    return `${head}\n${who}`
  }).join('\n\n')
}

// ── club events ──
export interface EventDraft { title: string; startAt: number; endAt: number; place: string; details: string }
export function eventProblem(d: EventDraft): string {
  if (!d.title.trim()) return 'Give the event a title.'
  if (!Number.isFinite(d.startAt) || !Number.isFinite(d.endAt)) return 'Pick a start and an end time.'
  if (d.endAt <= d.startAt) return 'The end must be after the start.'
  return ''
}
/** yyyy-MM-ddTHH:mm in the browser's time, for <input type="datetime-local">. */
export const toInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16) }
