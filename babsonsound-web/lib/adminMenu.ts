import type { OpsIcon } from '@/components/admin/OpsIcons'

// The Settings menu (the whole admin panel is called Settings). Six tabs, in this order: Settings (home), Users, Shows, Content, Notifications, Advanced.
// Pure (no React), so the role rules, the search, the old links and the Back targets are all tested.
// E-board (stored role `director`) sees every tab except Advanced. Admins see all six. Hidden, not greyed out: a person never sees what they cannot use.
// Rule for where a page lives: what people need often is in an everyday tab; what is rare, a default value or Admin-only is in Advanced.

export type AdminRole = 'director' | 'admin'
export type BadgeKey = 'pending' | 'reports' | 'alerts'
export type TabId = 'home' | 'users' | 'shows' | 'content' | 'notifications' | 'advanced'
export interface MenuTile { href: string; icon: OpsIcon; title: string; text: string; admin?: boolean; badge?: BadgeKey; eboard?: boolean }
export interface MenuGroup { title?: string; tiles: MenuTile[] }
export interface MenuTab {
  id: TabId; title: string; icon: OpsIcon; admin?: boolean
  /** A tab that is itself a page (Notifications) opens that address instead of showing tiles. */
  href?: string
  /** Shown as a count on the tab itself. */
  badge?: BadgeKey
  groups: MenuGroup[]
  /** All the tiles of all groups, flat. */
  tiles: MenuTile[]
}

const tab = (t: Omit<MenuTab, 'tiles'>): MenuTab => ({ ...t, tiles: t.groups.flatMap(g => g.tiles) })

/** Settings is the page itself (the overview), so it has no tiles. */
export const HOME: MenuTab = tab({ id: 'home', title: 'Settings', icon: 'radio', groups: [] })
/** Kept for older imports. */
export const TODAY = HOME

export const NOTIFICATIONS_HREF = '/admin/notifications'

export const SECTIONS: MenuTab[] = [
  tab({ id: 'users', title: 'Users', icon: 'users', groups: [{ tiles: [
    { href: '/admin/users', icon: 'users', title: 'Users and roles', text: 'Find people and give access', admin: true },
    { href: '/admin/training', icon: 'training', title: 'Training', text: 'Who is trained, check in and certify hosts' },
    { href: '/admin/phone-changes', icon: 'phone', title: 'Phone changes', text: 'Approve new numbers', admin: true },
    { href: '/admin/phone-lookup', icon: 'phone', title: 'Phone lookup', text: 'Find the account for a number', admin: true },
    { href: '/admin/birthdays', icon: 'birthdays', title: 'Birthdays', text: 'Who is celebrating soon', admin: true },
    { href: '/admin/booth', icon: 'users', title: 'Studio PC log', text: 'Who signed in at the studio and went live' },
  ] }] }),
  tab({ id: 'shows', title: 'Shows', icon: 'schedule', groups: [{ tiles: [
    { href: '/admin/schedule', icon: 'schedule', title: 'Schedule', text: 'See and edit what is on air, and one-time events' },
    { href: '/admin/slots', icon: 'slots', title: 'Show requests', text: 'Approve or decline requests', badge: 'pending' },
    { href: '/admin/show-updates', icon: 'updates', title: 'Show changes', text: 'Review edits hosts made' },
    { href: '/admin/autoschedule', icon: 'auto', title: 'Auto DJ', text: 'Rules and playlists for the music between shows' },
    { href: '/admin/setlists', icon: 'setlists', title: 'Set lists', text: 'Songs planned for shows', admin: true },
  ] }] }),
  tab({ id: 'content', title: 'Content', icon: 'library', groups: [
    { tiles: [
      { href: '/admin/library', icon: 'library', title: 'Episodes', text: 'Add and remove episodes' },
      { href: '/admin/music-library', icon: 'auto', title: 'Music library', text: 'Fix titles, covers, beats and loudness', admin: true },
      { href: '/admin/media', icon: 'library', title: 'Uploads', text: 'Add .mp3 files, folders and playlists', admin: true },
      { href: '/admin/requests', icon: 'requests', title: 'Song requests', text: 'What listeners asked to hear' },
      { href: '/admin/blocked-words', icon: 'blocked', title: 'Blocked words', text: 'Add words to the filter (Admins can also remove words)' },
    ] },
    { title: 'Content library', tiles: [
      { href: '/admin/music-library/review', icon: 'auto', title: 'Review queue', text: 'Songs the studio PC could not sort out alone', admin: true },
      { href: '/admin/music-library/activity', icon: 'auto', title: 'Library activity', text: 'What the studio PC changed lately', admin: true },
      { href: '/admin/expert?focus=library.measure_loudness', icon: 'auto', title: 'Loudness and beats', text: 'Measure loudness and find the beat of each song', admin: true },
      { href: '/admin/expert?focus=library.fetch_art', icon: 'auto', title: 'Cover art defaults', text: 'Look up album covers automatically', admin: true },
    ] },
  ] }),
  tab({ id: 'notifications', title: 'Notifications', icon: 'bell', href: NOTIFICATIONS_HREF, badge: 'alerts', groups: [] }),
  tab({ id: 'advanced', title: 'Advanced', icon: 'stats', admin: true, groups: [
    { title: 'Server', tiles: [
      { href: '/admin/server-load', icon: 'stats', title: 'Server load', text: 'Vercel server time: the allowance, protection level, readings and charts', admin: true },
    ] },
    { title: 'Limits and defaults', tiles: [
      { href: '/admin/listening-limits', icon: 'stats', title: 'Listening limits', text: 'When the player asks "still listening?", when it stops, and sleep hours', admin: true },
      { href: '/admin/expert', icon: 'auto', title: 'Expert settings', text: 'Every setting with its default. You almost never need these', admin: true },
    ] },
    { title: 'Site and content settings', tiles: [
      { href: '/admin/studio-form', icon: 'training', title: 'Studio form', text: 'The training form people open from /studioaccess', admin: true },
      { href: '/admin/easter-eggs', icon: 'eggs', title: 'Easter eggs', text: 'Hidden surprises on the site', admin: true },
      { href: '/admin/site-text', icon: 'updates', title: 'Page text', text: 'Edit the words on About and other pages', admin: true },
      { href: '/admin/launch-email', icon: 'mail', title: 'Launch email', text: 'Preview and send', admin: true },
    ] },
    { title: 'Tools', tiles: [
      { href: '/admin/stats', icon: 'stats', title: 'Stats', text: 'Listeners, hours and logs', eboard: true },
      { href: '/admin/feedback', icon: 'bug', title: 'Bugs and ideas', text: 'Reports from listeners', badge: 'reports', admin: true },
      { href: '/admin/tests', icon: 'tests', title: 'Tests', text: 'Preview features safely', admin: true },
      { href: '/admin/docs', icon: 'docs', title: 'Docs', text: 'Features, setup guides and reference', admin: true },
    ] },
  ] }),
]

const visible = (t: MenuTile, admin: boolean) => admin || !t.admin

/** The tabs and pages one role may see, in menu order (Settings first). A tab with nothing the role may open is dropped. */
export function menuFor(role: AdminRole): MenuTab[] {
  const admin = role === 'admin'
  const rest = SECTIONS
    .filter(s => admin || !s.admin)
    .map(s => tab({ ...s, groups: s.groups.map(g => ({ ...g, tiles: g.tiles.filter(t => visible(t, admin)) })).filter(g => g.tiles.length > 0) }))
    .filter(s => s.href || s.tiles.length > 0)
  return [HOME, ...rest]
}

/** Pages E-board can open that sit under an Admin-only tab: reachable from search and the "More" links on the home page, not from the menu. */
export const eboardExtras = (): (MenuTile & { where: string })[] =>
  SECTIONS.filter(s => s.admin).flatMap(s => s.tiles.filter(t => t.eboard).map(t => ({ ...t, where: s.title })))

/** Where an old link opens. Every address that worked before still works: the old tab names go to their new homes. */
export const LEGACY_HASH: Record<string, TabId> = {
  onair: 'shows', people: 'users', music: 'content', messages: 'notifications',
  customize: 'advanced', rules: 'advanced', system: 'advanced', tools: 'advanced', settings: 'advanced',
}
const TAB_IDS = new Set<string>(['home', 'users', 'shows', 'content', 'notifications', 'advanced'])

/** "#people" -> "users". Unknown or empty -> "home". A tab the role cannot see -> "home". */
export function resolveHash(hash: string, role: AdminRole = 'admin'): TabId {
  const h = hash.replace(/^#/, '').toLowerCase()
  const id = (LEGACY_HASH[h] ?? (TAB_IDS.has(h) ? h : 'home')) as TabId
  return menuFor(role).some(t => t.id === id) ? id : 'home'
}
/** The address that shows a tab (the home tab has no hash). Notifications is its own page. */
export const tabHref = (id: TabId) => id === 'home' ? '/admin' : id === 'notifications' ? NOTIFICATIONS_HREF : `/admin#${id}`

// Pages that are not menu tiles but belong to a tab, so Back and search know where they are.
export const EXTRA_PAGES: { href: string; title: string; text: string; tab: TabId; admin?: boolean }[] = [
  { href: '/admin/insights', title: 'What listeners like', text: 'Most played and most liked', tab: 'advanced' },
  { href: '/admin/usage', title: 'Listening hours', text: 'Hours listened by day', tab: 'advanced', admin: true },
  { href: '/admin/listening', title: 'Listening log', text: 'Who listened and when', tab: 'advanced', admin: true },
  { href: '/admin/playlog', title: 'Play log', text: 'Every song played, with export', tab: 'advanced', admin: true },
  { href: '/admin/network', title: 'Friends web', text: 'Who follows whom', tab: 'advanced', admin: true },
  { href: '/admin/controls', title: 'Station controls', text: 'Skip, stop and the ON AIR sign', tab: 'home' },
]

const pathOnly = (h: string) => h.split('?')[0].split('#')[0]

/** The tab a page belongs to. Longest matching address wins, so /admin/music-library/review is Content like its parent. */
export function tabOfPath(path: string): TabId {
  const p = pathOnly(path).replace(/\/$/, '')
  if (p === '' || p === '/admin') return 'home'
  if (p === NOTIFICATIONS_HREF || p === '/admin/notify') return 'notifications'
  let best: { len: number; tab: TabId } | null = null
  const consider = (href: string, id: TabId) => {
    const h = pathOnly(href)
    if ((p === h || p.startsWith(`${h}/`)) && (!best || h.length > best.len)) best = { len: h.length, tab: id }
  }
  for (const s of SECTIONS) for (const t of s.tiles) if (!t.href.includes('?')) consider(t.href, s.id) // a tile that only points into another page (a setting) does not own it
  for (const e of EXTRA_PAGES) consider(e.href, e.tab)
  if (p === '/admin/settings') return 'advanced'
  return (best as { tab: TabId } | null)?.tab ?? 'home'
}

export interface FromSearch { tab: TabId; href: string }

/**
 * Where a page's Back bar goes. Normally the tab the page belongs to (never home), unless that tab is hidden from this role (then home).
 * Someone who opened the page from search goes back to the tab they were on when they searched.
 */
export function backTarget(path: string, role: AdminRole, from?: FromSearch | null): { href: string; label: string } {
  const sub = pathOnly(path).replace(/\/$/, '')
  if (sub === NOTIFICATIONS_HREF) return { href: '/admin', label: HOME.title } // Notifications is a tab itself, so Back goes to the home page
  const menu = menuFor(role)
  let id: TabId = from && pathOnly(from.href).replace(/\/$/, '') === sub ? from.tab : tabOfPath(path)
  if (!menu.some(t => t.id === id)) id = 'home'
  const t = menu.find(m => m.id === id) ?? HOME
  return { href: tabHref(id), label: t.title }
}

export interface SearchEntry { href: string; icon: OpsIcon; title: string; text: string; where: string; badge?: BadgeKey; setting?: boolean }
/** Something searchable that is not a menu page: a setting (admins only). */
export interface ExtraEntry { href: string; title: string; text: string; where: string; keywords?: string }

/** Every page the role may open, plus the extra entries (settings), as one flat list. */
export function searchEntries(role: AdminRole, extra: ExtraEntry[] = []): SearchEntry[] {
  const admin = role === 'admin'
  const menu = menuFor(role)
  const pages: SearchEntry[] = [
    ...menu.flatMap(s => s.href ? [{ href: s.href, icon: s.icon, title: s.title, text: 'Alerts, and send a message to phones', where: s.title, badge: s.badge }] : s.tiles.map(t => ({ href: t.href, icon: t.icon, title: t.title, text: t.text, where: s.title, badge: t.badge }))),
    ...(role === 'director' ? eboardExtras().map(t => ({ href: t.href, icon: t.icon, title: t.title, text: t.text, where: 'More', badge: t.badge })) : []),
    ...EXTRA_PAGES.filter(e => (admin || !e.admin) && e.tab !== 'home').filter(e => admin || e.tab !== 'advanced' || e.href === '/admin/insights').map(e => ({ href: e.href, icon: 'stats' as OpsIcon, title: e.title, text: e.text, where: menu.find(m => m.id === e.tab)?.title ?? 'More' })),
  ]
  const seen = new Set<string>()
  const uniq = pages.filter(p => (seen.has(p.href) ? false : (seen.add(p.href), true)))
  const settings = admin ? extra.map(e => ({ href: e.href, icon: 'auto' as OpsIcon, title: e.title, text: e.text, where: e.where, setting: true, keywords: e.keywords ?? '' })) : []
  return [...uniq, ...settings]
}

/** Every word typed must appear in the page's title, text, heading (or a setting's keywords). Order does not matter. */
export function searchMenu(role: AdminRole, query: string, extra: ExtraEntry[] = []): SearchEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return searchEntries(role, extra).filter(e => {
    const hay = `${e.title} ${e.text} ${e.where} ${(e as { keywords?: string }).keywords ?? ''}`.toLowerCase()
    return words.every(w => hay.includes(w))
  })
}

export const FROM_KEY = 'admin.from'
/** What the hub remembers when a search result is opened: the tab the person was on, and the page they went to. */
export const fromNote = (tab: TabId, href: string) => JSON.stringify({ tab, href } satisfies FromSearch)
export function readFromNote(raw: string | null): FromSearch | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<FromSearch>
    return typeof v.href === 'string' && typeof v.tab === 'string' && TAB_IDS.has(v.tab) ? { tab: v.tab as TabId, href: v.href } : null
  } catch { return null }
}
