// Shared by the website and the API. Content is PRIVATE (students only) unless a host adult-signs this agreement.

export const PUBLIC_AGREEMENT_VERSION = '2026-10-16'

export const PUBLIC_CLAUSES: string[] = [
  'I am 18 or older, and everyone who speaks, performs or appears in this content is 18 or older. No one under 18 is in it.',
  'I own this content or have permission to share it, including any music, clips or other material in it.',
  'Everyone who speaks or appears in it knows it will be public and has agreed to that.',
  'I understand anyone on the internet, not only Babson students, will be able to watch or listen, and copies may be saved by others.',
  'I can switch it back to private at any time. Switching it back stops new viewers from the site, but cannot remove copies already saved or shared.',
]

/** Why someone cannot see the option. Shown instead of the agreement. */
export type AdultStatus = 'adult' | 'minor' | 'unknown'
export const NOT_ADULT_MESSAGE: Record<Exclude<AdultStatus, 'adult'>, string> = {
  minor: 'Public sharing is turned off for anyone under 18. Your content stays visible to Babson students only.',
  unknown: 'Add your birthday or age range in your profile first. Public sharing is only offered once we know you are 18 or older.',
}

/** A real full name: at least two words. */
export const looksLikeFullName = (s: string) => s.trim().split(/\s+/).filter(w => w.length > 0).length >= 2 && s.trim().length >= 5
