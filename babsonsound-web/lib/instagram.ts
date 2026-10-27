// Instagram handles: accept "@name", "name" or a pasted instagram.com link, keep just the handle.
// Pure rules (no server imports) so the website, the API and the tests share them. This only checks the shape of a handle:
// nothing here (or anywhere) checks that the account exists or belongs to the person.

/** Paths on instagram.com that are pages, not people. */
const NOT_PEOPLE = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'web', 'developer', 'legal', 'privacy', 'press', 'api', 'challenge', 'oauth'])

/** The clean handle (lowercase, no @), or null when the text is not a handle or an Instagram profile link. */
export function cleanInstagram(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let s = input.trim()
  if (!s) return null
  // A pasted link: https://www.instagram.com/name/?igsh=... (also instagr.am and m.instagram.com, with or without the scheme)
  const link = s.match(/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?(?:instagram\.com|instagr\.am)\/(.*)$/i)
  if (link) {
    const first = link[1].split(/[/?#]/)[0]
    if (!first || NOT_PEOPLE.has(first.toLowerCase())) return null
    s = first
  } else if (/[/?#:\s]/.test(s.replace(/^@/, ''))) return null
  s = s.replace(/^@/, '')
  if (s.length < 1 || s.length > 30) return null
  if (!/^[A-Za-z0-9._]+$/.test(s) || s.endsWith('.') || s.includes('..')) return null
  if (NOT_PEOPLE.has(s.toLowerCase())) return null
  return s.toLowerCase()
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle)}/`
