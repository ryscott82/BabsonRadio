import { nyParts, nyWeekKey } from './slotAuto.ts'
import { LIVE_MAX_MINUTES } from './studioBookCore.ts'

// The Host a show page, with no React: lengths, the weekly notice, popular-times shading, "next open times", the calendar file and the saved draft.

export type ShowType = 'live' | 'prerecorded'
export const LIVE_LENGTHS = [30, 60, 90] as const
export const PRE_LENGTHS = [30, 60, 90, 120] as const
export const MORE_LENGTHS = [15, 45, 150, 180, 240]

/** Length chips. A live show is at most 90 minutes; a pre-recorded show keeps its own cap (`maxMinutes`, 240 today). */
export function lengthsFor(type: ShowType, maxMinutes = 240): number[] {
  return type === 'live' ? LIVE_LENGTHS.filter(m => m <= LIVE_MAX_MINUTES) : PRE_LENGTHS.filter(m => m <= maxMinutes)
}
/** The "more" lengths, only for a pre-recorded show (a live show never goes over 90). */
export const moreLengths = (type: ShowType, maxMinutes = 240) => (type === 'live' ? MORE_LENGTHS.filter(m => m < LIVE_MAX_MINUTES && !LIVE_LENGTHS.includes(m as 30)) : MORE_LENGTHS.filter(m => m <= maxMinutes))
/** Changing to live with a long length picks the longest allowed. */
export const clampLength = (type: ShowType, minutes: number) => (type === 'live' && minutes > LIVE_MAX_MINUTES ? LIVE_MAX_MINUTES : minutes)

/** A live show uses the studio unless the person ticks "I am not using the studio". Pre-recorded shows never do. */
export const usesStudio = (type: ShowType, noStudio: boolean) => type === 'live' && !noStudio

export function studioLine(type: ShowType, noStudio: boolean): string {
  if (type !== 'live') return ''
  return noStudio ? 'Not using the studio. The room stays free for others.' : 'Uses the studio. Nobody else can book it then.'
}

// ── the weekly notice ──
export interface NoticeRules { autoApproveHours: number; weekLimit?: number }
/** What happens to a request at `startMs`: approved by itself after 24 hours, or waits for staff when the person already has a show that week. */
export function weekNotice(startMs: number, weekHasShow: Record<string, boolean>, rules: NoticeRules): { auto: boolean; line: string } {
  const has = weekHasShow[nyWeekKey(startMs)] === true
  return has
    ? { auto: false, line: 'This one will need staff approval, because you already have a show that week.' }
    : { auto: true, line: `Approved automatically ${rules.autoApproveHours} hours after you send it.` }
}

// ── popular times ──
export const LEVEL_CLASS = ['', 'bg-br-gold/10', 'bg-br-gold/20', 'bg-br-gold/35'] as const
export const LEVEL_WORD = ['', 'a little popular', 'popular', 'most popular'] as const

/** 0 to 3 for the hour that holds this instant (grid is 7 days x 24 hours, Sunday first, station time). */
export function levelAt(grid: number[][] | null | undefined, ms: number): 0 | 1 | 2 | 3 {
  if (!grid) return 0
  const p = nyParts(ms)
  const v = grid[p.dow]?.[p.h] ?? 0
  return (v >= 3 ? 3 : v === 2 ? 2 : v === 1 ? 1 : 0) as 0 | 1 | 2 | 3
}

export const categoryWord = (c: string) => (c ? c[0].toUpperCase() + c.slice(1) : '')

/** "Popular for Podcast shows: Tue 8-10 pm, Thu 7-9 pm", or '' when there is no data. */
export function popularLine(category: string, top: { label: string }[], fallback: boolean): string {
  if (!top.length) return ''
  const when = top.slice(0, 2).map(t => t.label).join(', ')
  return fallback || !category ? `Popular on the station: ${when}` : `Popular for ${categoryWord(category)} shows: ${when}`
}

// ── next open times ──
export interface Span { startAt: number; endAt: number }
/** A few open starts (30-minute marks) a person could take now: at least `leadHours` ahead, not overlapping anything, spread over different hours. */
export function nextOpen(ranges: Span[], now: number, leadHours: number, lengthMin: number, n = 4, horizonDays = 14): number[] {
  const step = 30 * 60_000
  const first = Math.ceil((now + leadHours * 3_600_000) / step) * step
  const out: number[] = []
  const free = (s: number) => !ranges.some(r => r.startAt < s + lengthMin * 60_000 && s < r.endAt)
  const hour = (s: number) => nyParts(s).h
  for (let s = first; s < now + horizonDays * 86_400_000 && out.length < n; s += step) {
    const h = hour(s)
    if (h < 8 || h >= 22) continue // suggestions stay in sensible hours; the grid shows every time
    if (!free(s)) continue
    const last = out[out.length - 1]
    if (last !== undefined && s - last < 3 * 3_600_000) continue
    out.push(s)
  }
  return out
}

// ── calendar file ──
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** A one-event .ics file, built in the browser. */
export function buildIcs(e: { title: string; startAt: number; endAt: number; description?: string; uid?: string }): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Babson Radio//Host a show//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.uid ?? `${e.startAt}-show`}@babsonradio`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(e.startAt)}`, `DTEND:${stamp(e.endAt)}`,
    `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

// ── a saved draft (the browser may block storage, so everything is in try/catch) ──
const KEY = 'br-host-draft'
export interface Draft { title?: string; description?: string; category?: string; type?: ShowType; location?: string }
export function saveDraft(d: Draft, store: Pick<Storage, 'setItem'> | undefined = safeStore()) { try { store?.setItem(KEY, JSON.stringify(d)) } catch { /* storage blocked */ } }
export function loadDraft(store: Pick<Storage, 'getItem'> | undefined = safeStore()): Draft {
  try { const raw = store?.getItem(KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {} } catch { return {} }
}
export function clearDraft(store: Pick<Storage, 'removeItem'> | undefined = safeStore()) { try { store?.removeItem(KEY) } catch { /* storage blocked */ } }
function safeStore(): Storage | undefined { try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined } }

// ── the policy box ──
export const POLICY_TEXT = 'I understand that a missed show or booking gets a mistake, then a warning, then a ban from hosting and booking for the rest of the semester. The E-board can excuse a mistake.'
