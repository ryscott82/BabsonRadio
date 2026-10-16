// Shared by the website and the API. Four agreements, signed once (one typed name) after the host quiz:
//  1. Terms and conditions  2. Respect the space (no slurs, no harassment, any hour)
//  3. Clean music hours (no explicit music or language 6 AM to 10 PM)  4. Song lists for the rights holders
// NOT LEGAL ADVICE. Have Babson Legal read both before launch (see "Questions to ask" in the beta guide).

export const AGREEMENTS_VERSION = '2026-10-16b'
export const CONDUCT_VERSION = AGREEMENTS_VERSION

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
  `I understand the clean hours are ${CLEAN_HOURS.startHour}:00 AM to ${CLEAN_HOURS.endHour - 12}:00 PM Eastern. During those hours I will air no explicit music, profanity or graphic sexual or violent content.`,
  'Explicit means any song marked Explicit or Parental Advisory by the label or the store, and any song or clip with profanity, even if it is edited by ear or I think it is mild.',
  'I will only play a clean or radio edit when I have checked that it is clean. If I have not checked it, I will not play it.',
  'A clean edit that still contains a slur is not allowed. The respect agreement applies to every song.',
  'This applies to pre-recorded shows too. I have listened to the whole recording and it is clean.',
]

export const TERMS_CLAUSES: string[] = [
  'I am a current Babson, Olin or Wellesley student. I will use only my own account and will never share my login.',
  'I will follow the Babson Radio rules I learned in training, the website Terms of Use and the Privacy Policy.',
  'I am responsible for everything broadcast during my slot: my words, my music, my guests and my recordings.',
  'My shows may be recorded. By default recordings are for Babson students only. Sharing a recording publicly needs a separate signed agreement, and I must be 18 or older.',
  'I understand the station can change or cancel my slot, and that staff decide what airs.',
]

export const SONGLIST_CLAUSES: string[] = [
  'I will keep a complete list of every song I play in each show (title and artist) and add it to my set list in the app during the show or right after.',
  'I agree to give Babson Radio that full list for every show so the station can report it to the music rights holders.',
  'For a pre-recorded show I will give the full list before it airs.',
  'I understand missing or incomplete lists can cost me future slots.',
]

export interface Agreement { id: 'terms' | 'respect' | 'clean' | 'songlist'; title: string; intro?: string; clauses: string[] }

/** In the order they are shown. */
export const HOST_AGREEMENTS: Agreement[] = [
  { id: 'terms', title: 'TERMS AND CONDITIONS', clauses: TERMS_CLAUSES },
  { id: 'respect', title: 'RESPECT THE SPACE', intro: SLUR_DEFINITION, clauses: CONDUCT_CLAUSES },
  { id: 'clean', title: 'CLEAN MUSIC HOURS', clauses: CLEAN_CLAUSES },
  { id: 'songlist', title: 'SONG LISTS FOR RIGHTS HOLDERS', clauses: SONGLIST_CLAUSES },
]

export const SIGN_HELP = 'Tick every box and type your full name to sign.'
