// Shared by the website and the API. Two signed agreements for anyone who goes on air:
//  1. Conduct agreement (everyone, once per version): no slurs, no harassment, at any hour.
//  2. Clean-hours pledge (each request that touches the clean hours): no explicit music or language.
// NOT LEGAL ADVICE. Have Babson Legal read both before launch (see "Questions to ask" in the beta guide).

export const CONDUCT_VERSION = '2026-10-16'
export const CLEAN_VERSION = '2026-10-16'

/** The clean hours, in station time. Anything on air between these hours must be clean. CONFIRM with the exec board. */
export const CLEAN_HOURS = { startHour: 6, endHour: 22, timezone: 'America/New_York' } as const

/** Station-local hour (0-23.99) for a timestamp. */
function localHour(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CLEAN_HOURS.timezone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h + m / 60
}

/** True when any minute of the slot falls inside the clean hours. Checked every 15 minutes. */
export function touchesCleanHours(startMs: number, endMs: number): boolean {
  for (let t = startMs; t < endMs; t += 15 * 60_000) {
    const h = localHour(t)
    if (h >= CLEAN_HOURS.startHour && h < CLEAN_HOURS.endHour) return true
  }
  return false
}

/** Plain-language definition shown above the conduct agreement. A working definition, not a legal one. */
export const SLUR_DEFINITION =
  'A slur is a word, phrase or name that demeans, dehumanizes or targets a person or group because of race, ethnicity, ' +
  'national origin, religion, sex, gender identity, sexual orientation, disability, age or another protected characteristic. ' +
  'It counts in any language. It counts if it is spelled out, abbreviated, bleeped, muffled, replaced with symbols or hinted at. ' +
  'It counts when it is in a song, a clip or a quote, and when the person using it belongs to the group in question. ' +
  'If you are not sure whether something is a slur, do not air it and ask a director first.'

export const CONDUCT_CLAUSES: string[] = [
  'I will not say, play, read or air a slur (as defined above) at any hour, live or pre-recorded, in my own words, in music, or in anything a guest says.',
  'I will not use the station to harass, threaten, demean or expose anyone, and I will not share anyone’s private information on air.',
  'I will follow Babson College’s student conduct and nondiscrimination policies and the Babson Radio rules I learned in training.',
  'I am responsible for my guests. I will tell them these rules before they speak, and I will cut them off if they break them.',
  'I understand the station can cut my broadcast, cancel my slot, remove my recordings and report a violation to Babson if I break these rules.',
  'If I am unsure about a song or a statement, I will leave it out and ask a director.',
]

export const CLEAN_CLAUSES: string[] = [
  `I understand my slot overlaps the clean hours (${CLEAN_HOURS.startHour}:00 AM to ${CLEAN_HOURS.endHour - 12}:00 PM Eastern). During those hours I will air no explicit music, profanity or graphic sexual or violent content.`,
  'Explicit means any song marked Explicit or Parental Advisory by the label or the store, and any song or clip with profanity, even if it is edited by ear or I think it is mild.',
  'I will only play a clean or radio edit when I have checked that it is clean. If I have not checked it, I will not play it.',
  'A clean edit that still contains a slur is not allowed. The conduct agreement applies to every song.',
  'This applies to pre-recorded shows too. I have listened to the whole recording and it is clean.',
]

export const SIGN_HELP = 'Tick every box and type your full name to sign.'
