// Shared by the website and the API. One agreement in two parts, signed once (one typed name) in the training, before the quiz:
//  1. Radio Room (8 lines: guests, training, signing in, the gear, bookings and quiet hours, leaving it tidy, recordings, conduct)
//  2. Radio Agreement (3 lines: explicit songs and slurs, private information, responsibility and song lists)
// NOT LEGAL ADVICE. Have Babson Legal read both before launch (see "Questions to ask" in the beta guide).

export const AGREEMENTS_VERSION = '2026-11-14d'
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

// Nov 14: two parts, the Radio Room (8 lines) and the Radio Agreement (3 lines). Wording is Ryan's, kept as he wrote it.
// Changing this text needs a new AGREEMENTS_VERSION (everyone signs again once).
export const STUDIO_CLAUSES: string[] = [
  'I will never bring an untrained member into the Babson Sound Radio Room',
  'I am not allowed to use the Radio Room gear until I have completed this training',
  'I must sign in to the Radio Room using a QR code or my Babson Sound Account before using equipment',
  'All the gear belongs to Babson Sound. I will use it the way I was trained, I will not rewire, move or take anything, and I will report anything broken in the Babson Sound WhatsApp right away.',
  'A booking reserves the studio. I respect other people’s bookings and leave on time, and during quiet hours. I keep the volume as low as possible',
  'When I leave, the studio is as I found it: mics off, desk clear, gear back where it was, and I sign out of the booth.',
  'Sessions and shows in the studio will be recorded. Recordings are for students only, unless I am 18 or older and sign a separate agreement to make one public.',
  'I follow the Terms of Use, the Privacy Policy and Babson’s student conduct and nondiscrimination policies. Breaking these rules can mean losing studio access, my slots and my recordings, and a report to Babson.',
]

export const ON_AIR_CLAUSES: string[] = [
  'I will not play explicit songs from 6AM to 10PM, and will not air any egregious words or slurs at any time. I have checked all explicit phrases against the reference tool at babsonradio.com/words',
  'I will not share private information about anyone while on-air including but not limited to phone number, email, or address.',
  'I am responsible for everything on air during my time, and staff decide what airs and can change or cancel my slot. I add every song I play (title and artist) to my set list during or right after each show, and before it airs for a pre-recorded show, so the station can report it to the rights holders. Missing lists can cost me future slots.',
]

export interface Agreement { id: 'terms' | 'respect' | 'clean' | 'songlist'; title: string; intro?: string; clauses: string[] }

/** In the order they are shown. */
export const HOST_AGREEMENTS: Agreement[] = [
  { id: 'terms', title: 'Radio Room', intro: 'I agree to:', clauses: STUDIO_CLAUSES },
  { id: 'respect', title: 'Radio Agreement', clauses: ON_AIR_CLAUSES },
]

export const SIGN_HELP = 'Tick every box and type your full name to sign.'
