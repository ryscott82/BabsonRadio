// Shared by the website and the API. One agreement in two parts, signed once (one typed name) in the training, before the quiz:
//  1. The studio (7 lines: access, guests, the gear, bookings and quiet hours, leaving it tidy, recordings, conduct)
//  2. On air (3 lines: slurs, harassment and private information; clean hours; responsibility and song lists)
// NOT LEGAL ADVICE. Have Babson Legal read both before launch (see "Questions to ask" in the beta guide).

export const AGREEMENTS_VERSION = '2026-11-14c'
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

// Nov 14: ten lines, mostly about the studio: 7 studio lines and 3 radio lines, with every rule from the longer version kept.
// Changing this text needs a new AGREEMENTS_VERSION (everyone signs again once).
export const STUDIO_CLAUSES: string[] = [
  'I am a current Babson, Olin or Wellesley student. I use only my own account and my own OneCard, and I never let anyone into the studio who is not trained.',
  'Nobody uses the studio or its gear until they have a Babson Sound account and have done this training. I am responsible for anyone I bring.',
  'All the gear belongs to Babson Sound. I use it the way I was trained, I do not rewire, move or take anything, and I report anything broken in the Babson Sound WhatsApp right away.',
  'A booking reserves the studio. I respect other people’s bookings and leave on time, and during quiet hours (Monday to Friday 9 AM to 4 PM and 10 PM to 7 AM) I keep the volume as low as possible.',
  'When I leave, the studio is as I found it: mics off, desk clear, gear back where it was, and I sign out of the booth.',
  'Sessions and shows in the studio may be recorded. Recordings are for students only, unless I am 18 or older and sign a separate agreement to make one public.',
  'I follow the Terms of Use, the Privacy Policy and Babson’s student conduct and nondiscrimination policies. Breaking these rules can mean losing studio access, my slots and my recordings, and a report to Babson.',
]

export const ON_AIR_CLAUSES: string[] = [
  'On air I never use a slur (as defined above), at any hour, live or pre-recorded, in my words, my music or from a guest. I do not harass, threaten or demean anyone, I do not share private information (phone numbers, addresses, where someone lives), and I cut off guests who break these rules. If I am not sure about a word, I leave it out and check the Explicit phrase reference or ask the E-board.',
  `From ${CLEAN_HOURS.startHour} AM to ${CLEAN_HOURS.endHour - 12} PM Eastern nothing explicit airs: no song marked Explicit, no profanity, no graphic sexual or violent content, even if it is mild or bleeped by ear. I only play a clean edit I have checked myself (a clean edit with a slur is still not allowed), and I have listened to all of a pre-recorded show. If I am not sure, I check the Explicit phrase reference (babsonradio.com/words).`,
  'I am responsible for everything on air during my time, and staff decide what airs and can change or cancel my slot. I add every song I play (title and artist) to my set list during or right after each show, and before it airs for a pre-recorded show, so the station can report it to the rights holders. Missing lists can cost me future slots.',
]

export interface Agreement { id: 'terms' | 'respect' | 'clean' | 'songlist'; title: string; intro?: string; clauses: string[] }

/** In the order they are shown. */
export const HOST_AGREEMENTS: Agreement[] = [
  { id: 'terms', title: 'The studio', clauses: STUDIO_CLAUSES },
  { id: 'respect', title: 'On air', intro: SLUR_DEFINITION, clauses: ON_AIR_CLAUSES },
]

export const SIGN_HELP = 'Tick every box and type your full name to sign.'
