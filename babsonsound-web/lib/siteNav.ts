// The main bar and its rules, with no React in it so the tests can read them.

export interface NavLink { href: string; label: string }

/** The bar everyone sees: Live, Schedule, Library, Members, About. */
export const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'Live' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/library', label: 'Library' },
  { href: '/members', label: 'Members' },
  { href: '/about', label: 'About' },
]

/** Guests (not a Babson, Olin or Wellesley email) only have Live and Members (events and info). */
export function linksFor(o: { isGuest: boolean; hosting: boolean; arts?: boolean }): NavLink[] {
  if (o.isGuest) return NAV_LINKS.filter(l => l.href === '/' || l.href === '/members')
  // BabsonARTS staff (signed in) also get a Settings tab: strikes and bans, adding staff, the studio form link.
  const base = o.hosting ? [...NAV_LINKS, { href: '/host', label: 'Host' }] : NAV_LINKS
  return o.arts ? [...base, { href: '/arts', label: 'Settings' }] : base
}

/** Old addresses that still work. /shows (the list) now lives on the Library page; /shows/<name> pages are unchanged. */
export const LEGACY_REDIRECTS: { source: string; destination: string }[] = [
  { source: '/shows', destination: '/library#shows' },
  { source: '/browse', destination: '/library' },
  // The radio room training moved from /training/studio to /training (the link people are given).
  { source: '/training/studio', destination: '/training' },
  { source: '/training/host', destination: '/training' },
]

/** Which bar link is lit for a path. Show pages belong to Library. */
export function activeHref(pathname: string, href: string): boolean {
  if (href === '/arts') return pathname === '/arts' || pathname.startsWith('/arts/')
  if (href === '/') return pathname === '/'
  if (href === '/library') return pathname === '/library' || pathname.startsWith('/library/') || pathname === '/shows' || pathname.startsWith('/shows/')
  if (href === '/members') return pathname === '/members' || pathname.startsWith('/members/') || pathname === '/slots' || pathname === '/training' || pathname.startsWith('/training/')
  return pathname.startsWith(href)
}

/** The profile menu: Host a show is the first thing for a student. */
export function profileMenu(o: { isStudent: boolean; isGuest: boolean; staff: boolean }): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [{ href: '/profile', label: 'Profile' }]
  if (o.isStudent && !o.isGuest) { out.unshift({ href: '/slots', label: 'Host a show' }); out.push({ href: '/members', label: 'Members' }) }
  if (o.staff) out.push({ href: '/admin', label: 'Settings' })
  return out
}
