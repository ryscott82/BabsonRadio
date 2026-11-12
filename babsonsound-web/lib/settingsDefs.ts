import type { SettingDef, SettingTier, SettingValue } from './settingRow.ts'

// How Admin > Settings words each setting. The server (GET /api/admin/settings, table in lib/adminSettings.ts) owns the key list, the kind,
// the range, the options, the default, the level (1 Everyday, 2 Customize, 3 Defaults and safety) and the current value. This file adds only
// what a person reads: a plain label, a help line, a group, a unit, and for risky values who is affected. A key the server has and this file
// does not know still shows, using the server's label, so a new setting never goes missing from the page.

/** A row as GET /api/admin/settings returns it (and PATCH returns the whole list again). */
export interface ServerSetting {
  key: string; label: string; level: 1 | 2 | 3
  kind: 'bool' | 'int' | 'num' | 'enum' | 'date' | 'text'
  min?: number; max?: number; options?: readonly (string | number)[]
  default: boolean | number | string; value: boolean | number | string
  changed: boolean; changedAt: number | null; changedBy: string | null
  /** 'main' rows get their own card on the page they control; 'expert' rows sit in that page's closed Expert fold. */
  visible?: 'main' | 'expert'
  /** false: the server stores it but nothing uses it right now. */
  enforced?: boolean
}

export interface SettingUi {
  label?: string
  help: string
  group: string
  unit?: string
  /** A stored fraction shown as a percent (0.5 -> 50). */
  scale?: number
  /** An hour of the day (0 to 23) shown as a clock choice. */
  hour?: boolean
  /** Names for enum options, by option text. */
  optionLabels?: Record<string, string>
  affects?: string
  risk?: string
  keywords?: string
}

export const TIER_INFO: Record<SettingTier, { title: string; text: string }> = {
  everyday: { title: 'Everyday', text: 'Switches you may flip on a normal week.' },
  customize: { title: 'Customize', text: 'How the station behaves. Change when listeners or hosts ask for it.' },
  defaults: { title: 'Defaults and safety', text: 'Set once and mostly leave. A wrong value here can affect every listener.' },
}
export const TIER_OF_LEVEL: Record<1 | 2 | 3, SettingTier> = { 1: 'everyday', 2: 'customize', 3: 'defaults' }

/** Plain questions for the Listening page, where one set of values covers students and guests (the guest switch is off). */
export const LISTENING_LABEL: Record<string, string> = {
  idleMin: 'How long before the player asks “still listening?”',
  sessionMaxMin: 'How long can someone listen in a row before the player stops?',
  quietEnabled: 'Pause playlists overnight (sleep hours)?',
  quietStart: 'When do sleep hours start?',
  quietEnd: 'When do sleep hours end?',
}

const SLOT_WHO = 'when every student\u2019s show request approves'
const LISTENERS = 'every listener on the site and in the app'
const auto = 'Auto DJ'
const lim = (a: 'student' | 'guest', k: string, ui: Omit<SettingUi, 'group'>): [string, SettingUi] => [`limits.${a}.${k}`, { ...ui, group: `Listening limits: ${a === 'student' ? 'students' : 'guests'}` }]
const W = { student: 'Students', guest: 'Guests' } as const

const audience = (a: 'student' | 'guest'): [string, SettingUi][] => [
  lim(a, 'quietEnabled', { label: `${W[a]}: pause playlists overnight (sleep)`, help: 'Playlists stop for sleep hours. Live shows still play.', affects: `${W[a].toLowerCase()} listening overnight`, risk: 'Turning it off lets playlists run all night.', keywords: 'sleep quiet night' }),
  lim(a, 'idleMin', { label: `${W[a]}: ask “still listening?” after`, help: 'Minutes with no tap or key press. 0 means never ask.', unit: 'minutes', keywords: 'idle inactive', affects: `${W[a].toLowerCase()}` }),
  lim(a, 'sessionMaxMin', { label: `${W[a]}: stop listening after`, help: 'Minutes in a row before the player stops. 0 means no limit.', unit: 'minutes', keywords: 'session maximum', affects: `${W[a].toLowerCase()}` }),
  lim(a, 'quietStart', { label: `${W[a]}: sleep starts`, help: 'Station time. Only used while sleep hours are on.', hour: true, keywords: 'quiet night', affects: `${W[a].toLowerCase()}` }),
  lim(a, 'quietEnd', { label: `${W[a]}: sleep ends`, help: 'Station time. Only used while sleep hours are on.', hour: true, keywords: 'quiet night', affects: `${W[a].toLowerCase()}` }),
  lim(a, 'dailyCapMin', { label: `${W[a]}: daily listening limit`, help: 'Not enforced right now: the server no longer counts listening minutes, to save server time. 0 means no limit.', unit: 'minutes', affects: W[a].toLowerCase(), risk: 'It has no effect today, but it will apply if counting is turned back on.', keywords: 'daily cap' }),
  lim(a, 'dailyAutoMin', { label: `${W[a]}: daily playlist limit`, help: 'Not enforced right now, same reason. 0 means no limit.', unit: 'minutes', affects: W[a].toLowerCase(), risk: 'It has no effect today, but it will apply if counting is turned back on.', keywords: 'daily cap playlist' }),
]

export const SETTING_UI: Readonly<Record<string, SettingUi>> = Object.fromEntries([
  ...audience('student'), ...audience('guest'),
  ['limits.refreshSec', { group: 'Listening limits: check-ins', label: 'Seconds between listening check-ins', help: 'How often an open player tells the server it is still there. Longer uses less server time.', unit: 'seconds', affects: LISTENERS, risk: 'Too short uses up server time faster. Too long makes the listener count lag.', keywords: 'refresh seconds server time' }],
  ['limits.budgetEnabled', { group: 'Listening limits: check-ins', label: 'Use the monthly listening hours limit', help: 'Off, because the hosting plan has no hour limit. When on, limits get stricter as the month’s listening hours fill up.', affects: LISTENERS, risk: 'Turning it on can cut listening short late in the month.', keywords: 'budget hours' }],
  ['auto.enabled', { group: auto, label: 'Auto DJ is on', help: 'Fills the gaps between shows with playlists. Off means nothing is planned for the gaps.', affects: LISTENERS, risk: 'Gaps between shows can go quiet.', keywords: 'autoschedule filler playlists' }],
  ['auto.learn', { group: auto, label: 'Auto DJ favors what listeners like', help: 'Leans toward genres with more listeners, ratings and reactions. Every genre still gets airtime.', affects: 'what plays between shows' }],
  ['auto.colorChanging', { group: auto, label: 'Night-time color-changing background', help: 'The site background follows the album colors while Auto DJ is on air.', keywords: 'album color theme', affects: 'the look of the site at night' }],
  ['auto.horizonHours', { group: auto, label: 'Plan Auto DJ this far ahead', help: 'How many hours ahead the gaps are filled.', unit: 'hours', affects: 'what the schedule shows' }],
  ['auto.stepMinutes', { group: auto, label: 'Auto DJ planning grid', help: 'The smallest slice of time Auto DJ plans.', unit: 'minutes', affects: 'what plays between shows' }],
  ['auto.maxBlockMinutes', { group: auto, label: 'Longest single Auto DJ block', help: 'A playlist block never runs longer than this, unless a rule sets its own length.', unit: 'minutes', affects: 'what plays between shows' }],
  ['auto.lockMinutes', { group: auto, label: 'Leave Auto DJ blocks alone when they start within', help: 'Blocks starting sooner than this are not changed when the plan is rebuilt, so what is playing never flips.', unit: 'minutes', affects: LISTENERS, risk: 'Too small lets the playlist change right under a listener.' }],
  ['auto.syncToAzuraCast', { group: auto, label: 'Send the plan to the radio server', help: 'After every rebuild, the plan is written to the playlists on the radio server (AzuraCast).', affects: LISTENERS, risk: 'On changes what actually plays, not just what the schedule shows.', keywords: 'azuracast sync' }],
  ['cpu.budgetHours', { group: 'Server time', label: 'How many server hours does Vercel allow each month?', help: 'Vercel’s Active CPU hours for the month. The meter and the tiers use this number.', unit: 'hours', affects: LISTENERS, risk: 'A number higher than the real allowance delays slowing the site down, and the site can be paused.', keywords: 'vercel cpu budget' }],
  ['cpu.reactionShare', { group: 'Server time', label: 'Most the reactions may use', help: 'Reactions are limited to this share of the monthly allowance.', unit: '%', scale: 100, affects: LISTENERS, keywords: 'reactions emoji' }],
  ['cpu.baseHours', { group: 'Server time', label: 'Hours Vercel already counted', help: 'Server hours used before our meter started counting. Added to the month’s total.', unit: 'hours', affects: 'the server-time meter', keywords: 'vercel cpu' }],
  ['cpu.reactionsLocked', { group: 'Server time', label: 'Turn reactions off for everyone?', help: 'Turns reactions off for everyone until you turn them back on.', affects: LISTENERS, keywords: 'reactions emoji' }],
  // Show requests: when a student's request approves itself. Changing any of these changes it for every student, so each one asks first.
  ['slots.afterHours', { group: 'Show requests', label: 'How long should a show request wait before it approves itself?', help: 'How long a request waits for staff before it approves by itself, if nothing else stops it. A Hold from staff always stops it.', unit: 'hours', affects: SLOT_WHO, risk: 'A shorter wait means requests approve sooner with less review.', keywords: 'auto approve automatic approval slot' }],
  ['slots.beforeStartHours', { group: 'Show requests', label: 'Latest an automatic approval can be before the show', help: 'The most hours before a show starts that a request may still approve itself. A show closer than this waits for staff.', unit: 'hours', affects: SLOT_WHO, keywords: 'auto approve cap slot' }],
  ['slots.weekLimit', { group: 'Show requests', label: 'How many shows can one person have approved automatically each week?', help: 'After this many automatic approvals in a week, that person\u2019s next requests wait for staff.', affects: SLOT_WHO, keywords: 'auto approve limit slot week' }],
  ['slots.maxRepeatWeeks', { group: 'Show requests', label: 'Most extra weeks a request can repeat', help: 'How many more weeks a student can ask for in one request. 0 turns repeating off.', unit: 'weeks', affects: 'every student\u2019s repeat requests', keywords: 'repeat weekly slot' }],
  ['slots.minLeadHours', { group: 'Show requests', label: 'Fewest hours ahead a show can be requested', help: 'A student cannot request a show that starts sooner than this.', unit: 'hours', affects: 'which shows every student can request', keywords: 'lead time notice slot' }],
  ['studio.capacity', { group: 'Studio', label: 'How many people can be in the studio at once?', help: 'Counts the person who booked. A booking or show request cannot list more guests than fit.', unit: 'people', affects: 'every studio booking and show request', keywords: 'studio capacity guests room' }],
  ['studio.openHour', { group: 'Studio', label: 'Studio bookings open at', help: 'The earliest start for a studio booking.', hour: true, affects: 'every studio booking' }],
  ['studio.closeHour', { group: 'Studio', label: 'Studio bookings close at', help: 'A studio booking must end by this hour.', unit: 'o\u2019clock (24-hour)', affects: 'every studio booking' }],
  ['studio.minMinutes', { group: 'Studio', label: 'Shortest studio booking', help: 'Bookings go in 30-minute steps.', unit: 'minutes', affects: 'every studio booking' }],
  ['studio.maxMinutes', { group: 'Studio', label: 'Longest studio booking', help: 'Bookings go in 30-minute steps.', unit: 'minutes', affects: 'every studio booking' }],
  ['studio.maxHolds', { group: 'Studio', label: 'Studio bookings one person can hold', help: 'Upcoming bookings at one time. Live shows do not count.', affects: 'every member who books the studio' }],
  ['studio.lookAheadDays', { group: 'Studio', label: 'How far ahead the studio can be booked', help: 'The furthest day a member can book.', unit: 'days', affects: 'every studio booking' }],
  ['studio.cancelHours', { group: 'Studio', label: 'Free cancel until', help: 'Hours before a booking when cancelling is still free.', unit: 'hours', affects: 'every studio booking' }],
  ['studio.graceMinutes', { group: 'Studio', label: 'Release an unused booking after', help: 'If nobody checks in this long after the start, the booking is released and the person is emailed.', unit: 'minutes', affects: 'every studio booking' }],
  ['studio.quiet', { group: 'Studio', label: 'Quiet hours', help: 'Days and hour ranges, like Mon-Fri 9-16; Mon-Fri 22-7. Members see a warning. Nothing is blocked.', affects: 'the warning on bookings and show requests', keywords: 'quiet hours volume loud' }],
  ['strikes.studioNoShow', { group: 'Strikes', label: 'Flag a strike for a missed studio booking', help: 'Off by default. When on, a booking nobody checked in to is flagged for the E-board to review. It never becomes a strike by itself.', affects: 'every member who books the studio' }],
  ['strikes.semesterEnd', { group: 'Strikes', label: 'Strikes end on', help: 'Confirmed strikes stop counting after this date (end of day, station time). Update it each semester.', affects: 'every member with a strike', keywords: 'semester expire' }],
  ['strikes.lateCancelHours', { group: 'Strikes', label: 'Flag a show cancelled less than this far ahead', help: 'A cancellation closer to the start than this is flagged for review. 0 turns it off.', unit: 'hours', affects: 'every member who cancels a show' }],
  ['cpu.auto', { group: 'Server time', label: 'Slow features down automatically', help: 'When the month fills up, reactions, ratings and other extras slow down or turn off by themselves.', affects: LISTENERS, risk: 'Off means nothing slows down until you do it by hand, and the site can be paused.', keywords: 'vercel cpu tiers' }],
  ['cpu.protection', { group: 'Server time', label: 'How early should the site slow things down to protect server time?', help: 'How early the site slows extras down as the month’s server time fills. Strict starts earlier, Relaxed later. Custom means the individual values were changed by hand; choosing a level replaces them.', optionLabels: { relaxed: 'Relaxed', normal: 'Normal', strict: 'Strict', custom: 'Custom' }, affects: LISTENERS, risk: 'Relaxed lets the month fill further before anything slows down, and the site can be paused.', keywords: 'protection preset thresholds tiers vercel cpu' }],
  ['cpu.nowPlayingDirect', { group: 'Server time', label: 'Read “now playing” straight from the radio server', help: 'Pages read the radio server’s public feed instead of asking our server. Saves server time.', optionLabels: { auto: 'Automatic', on: 'Always on', off: 'Off' }, affects: LISTENERS, risk: 'If the feed is down, now playing can go stale.', keywords: 'direct feed' }],
  ['cpu.directAt', { group: 'Server time', label: 'Switch to the direct feed at', help: 'Share of the monthly allowance where Automatic starts reading now playing straight from the radio server.', unit: '%', scale: 100, affects: LISTENERS, keywords: 'direct feed threshold' }],
  ...([3, 2, 1] as const).flatMap(t => (['tight', 'critical'] as const).map<[string, SettingUi]>(step => [`cpu.th.${t}.${step}`, {
    group: 'Server time', label: `Tier ${t}: ${step === 'tight' ? 'slow down' : 'turn off'} at`, unit: '%', scale: 100,
    help: `Share of the monthly allowance (used, or on track to use) where tier ${t} ${step === 'tight' ? 'is slowed' : 'is turned off'}. Above 100% means never by itself.`,
    affects: LISTENERS, risk: 'Set too high and the site can run out of server time and be paused.', keywords: 'vercel cpu threshold level',
  }])),
])

const asValue = (kind: ServerSetting['kind'], v: SettingValue): SettingValue => (kind === 'enum' ? String(v) : v)

/** The page's model of one server row: the words from SETTING_UI (or the server's label), everything else from the server. */
export function toRow(s: ServerSetting): { def: SettingDef; value: SettingValue; changedAt: number | null; changedBy: string | null } {
  const ui = SETTING_UI[s.key]
  const num = s.kind === 'int' || s.kind === 'num'
  const kind: SettingDef['kind'] = s.kind === 'bool' ? 'boolean' : s.kind === 'enum' ? 'choice' : s.kind === 'date' ? 'date' : s.kind === 'text' ? 'text' : ui?.hour ? 'hour' : 'number'
  const optionLabel = (o: string | number) => ui?.optionLabels?.[String(o)] ?? (ui?.unit ? `${o} ${ui.unit}` : String(o))
  const def: SettingDef = {
    id: s.key, tier: TIER_OF_LEVEL[s.level], level: s.level, visible: s.visible ?? 'expert', ...(s.enforced === false ? { notEnforced: true } : {}),
    label: ui?.label ?? s.label, help: ui?.help ?? '', group: ui?.group ?? 'Other',
    kind, default: asValue(s.kind, s.default),
    ...(num ? { min: s.min, max: s.max, unit: ui?.unit, scale: ui?.scale, integer: s.kind === 'int' } : {}),
    ...(s.kind === 'enum' ? { choices: [...(s.options ?? []).map(String), ...(String(s.value) === 'custom' && !(s.options ?? []).map(String).includes('custom') ? ['custom'] : [])].map(o => ({ value: o, label: optionLabel(o) })) } : {}),
    ...(ui?.affects ? { affects: ui.affects } : {}), ...(ui?.risk ? { risk: ui.risk } : {}), ...(ui?.keywords ? { keywords: ui.keywords } : {}),
  }
  return { def, value: asValue(s.kind, s.value), changedAt: s.changedAt, changedBy: s.changedBy }
}
