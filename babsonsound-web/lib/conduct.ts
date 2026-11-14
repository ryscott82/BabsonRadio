// Shared by the website and the API. Four agreements, signed once (one typed name) in the training, before the quiz:
//  1. Terms and conditions  2. Respect the space (no slurs, no harassment, any hour)
//  3. Clean music hours (no explicit music or language 6 AM to 10 PM)  4. Song lists for the rights holders
// NOT LEGAL ADVICE. Have Babson Legal read both before launch (see "Questions to ask" in the beta guide).

export const AGREEMENTS_VERSION = '2026-11-14'
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

/** Plain-language definition shown above the respect agreement. A working definition, not a legal one. */
export const SLUR_DEFINITION =
  'A slur is any word or name that demeans a person or group for their race, ethnicity, national origin, religion, sex, gender identity, ' +
  'sexual orientation, disability, age or another protected trait. It counts in any language, in songs, clips and quotes, when it is ' +
  'bleeped, abbreviated or hinted at, and even when the speaker belongs to that group.'

// Nov 14: shortened from 20 lines to 10 with the same rules. Changing this text needs a new AGREEMENTS_VERSION (everyone signs again once).
export const TERMS_CLAUSES: string[] = [
  'I am a current Babson, Olin or Wellesley student. I use only my own account, and I follow the Terms of Use, the Privacy Policy and the rules from this training.',
  'I am responsible for everything on air during my time: my words, my music, my guests and my recordings. Staff decide what airs and can change or cancel my slot.',
  'My shows may be recorded. Recordings are for students only, unless I am 18 or older and sign a separate agreement to make one public.',
]

export const CONDUCT_CLAUSES: string[] = [
  'I will never air a slur, at any hour, live or pre-recorded: not in my words, my music or anything a guest says.',
  'I will not use the station to harass, threaten or demean anyone, and I will not share private information on air (phone numbers, addresses, where someone lives).',
  'I tell my guests these rules before they speak and cut them off if they break them. If I am not sure about a word, I leave it out and look it up or ask the E-board.',
  'I follow Babson’s student conduct and nondiscrimination policies. Breaking these rules can mean my show is cut, I lose my slot, my recordings are removed and it is reported to Babson.',
]

export const CLEAN_CLAUSES: string[] = [
  `From ${CLEAN_HOURS.startHour} AM to ${CLEAN_HOURS.endHour - 12} PM Eastern nothing explicit airs: no song marked Explicit, no profanity, no graphic sexual or violent content, even if it is mild or bleeped by ear.`,
  'I only play a clean edit I have checked myself. A clean edit that still has a slur is not allowed. For a pre-recorded show, I have listened to all of it.',
]

export const SONGLIST_CLAUSES: string[] = [
  'I add every song I play (title and artist) to my set list during or right after each show, and before it airs for a pre-recorded show, so the station can report it to the rights holders. Missing lists can cost me future slots.',
]

export interface Agreement { id: 'terms' | 'respect' | 'clean' | 'songlist'; title: string; intro?: string; clauses: string[] }

/** In the order they are shown. */
export const HOST_AGREEMENTS: Agreement[] = [
  { id: 'terms', title: 'Terms', clauses: TERMS_CLAUSES },
  { id: 'respect', title: 'Respect the space', intro: SLUR_DEFINITION, clauses: CONDUCT_CLAUSES },
  { id: 'clean', title: 'Clean music hours', clauses: CLEAN_CLAUSES },
  { id: 'songlist', title: 'Song lists', clauses: SONGLIST_CLAUSES },
]

export const SIGN_HELP = 'Tick every box and type your full name to sign.'
