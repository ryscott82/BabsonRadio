import type { OpsIcon } from '@/components/admin/OpsIcons'

// The Settings menu (the whole admin panel is called Settings): six headings, every existing page grouped under one. Pure (no React), so the role rules and
// the search are tested. E-board (stored role `director`) sees Today, Shows, Music and People. Admins also see Customize and System.
// Hidden, not greyed out: a person never sees what they cannot use. A few pages inside an Admin heading are still open to E-board (flagged `eboard`);
// they are reachable from search and from the "More" links on Today.

export type AdminRole = 'director' | 'admin'
export type BadgeKey = 'pending' | 'reports'
export interface MenuTile { href: string; icon: OpsIcon; title: string; text: string; admin?: boolean; badge?: BadgeKey; eboard?: boolean }
export interface MenuSection { id: string; title: string; icon: OpsIcon; admin?: boolean; tiles: MenuTile[] }

/** Today is the page itself (the overview), so it has no tiles. */
export const TODAY: MenuSection = { id: 'home', title: 'Today', icon: 'radio', tiles: [] }

export const SECTIONS: MenuSection[] = [
  { id: 'shows', title: 'Shows', icon: 'schedule', tiles: [
    { href: '/admin/schedule', icon: 'schedule', title: 'Schedule', text: 'See and edit what is on air, and one-time events' },
    { href: '/admin/slots', icon: 'slots', title: 'Show requests', text: 'Approve or decline requests', badge: 'pending' },
    { href: '/admin/show-updates', icon: 'updates', title: 'Show changes', text: 'Review edits hosts made' },
    { href: '/admin/autoschedule', icon: 'auto', title: 'Auto DJ', text: 'Rules and playlists for the music between shows (Admins also get the advanced settings)' },
  ] },
  { id: 'music', title: 'Music', icon: 'library', tiles: [
    { href: '/admin/library', icon: 'library', title: 'Episodes', text: 'Add and remove episodes' },
    { href: '/admin/music-library', icon: 'auto', title: 'Music library', text: 'Fix titles, covers, beats and loudness', admin: true },
    { href: '/admin/media', icon: 'library', title: 'Uploads', text: 'Add .mp3 files, folders and playlists', admin: true },
    { href: '/admin/requests', icon: 'requests', title: 'Song requests', text: 'What listeners asked to hear' },
    { href: '/admin/setlists', icon: 'setlists', title: 'Set lists', text: 'Songs planned for shows', admin: true },
  ] },
  { id: 'people', title: 'People', icon: 'users', tiles: [
    { href: '/admin/users', icon: 'users', title: 'Users and roles', text: 'Find people and give access', admin: true },
    { href: '/admin/training', icon: 'training', title: 'Training', text: 'Check in and certify hosts' },
    { href: '/admin/studio-form', icon: 'training', title: 'Studio form', text: 'The training form people open from /studioaccess', admin: true },
    { href: '/admin/phone-changes', icon: 'phone', title: 'Phone changes', text: 'Approve new numbers', admin: true },
    { href: '/admin/phone-lookup', icon: 'phone', title: 'Phone lookup', text: 'Find the account for a number', admin: true },
    { href: '/admin/birthdays', icon: 'birthdays', title: 'Birthdays', text: 'Who is celebrating soon', admin: true },
    { href: '/admin/booth', icon: 'users', title: 'Studio PC log', text: 'Who signed in at the studio and went live' },
  ] },
  { id: 'customize', title: 'Customize', icon: 'bell', admin: true, tiles: [
    { href: '/admin/easter-eggs', icon: 'eggs', title: 'Easter eggs', text: 'Hidden surprises on the site', admin: true },
    { href: '/admin/site-text', icon: 'updates', title: 'Page text', text: 'Edit the words on About and other pages', admin: true },
    { href: '/admin/blocked-words', icon: 'blocked', title: 'Blocked words', text: 'Add words to the filter (Admins can also remove words and set how strict it is)', eboard: true },
    { href: '/admin/notify', icon: 'bell', title: 'Send notification', text: 'Message everyone or a group', admin: true },
    { href: '/admin/launch-email', icon: 'mail', title: 'Launch email', text: 'Preview and send', admin: true },
    { href: '/admin/feedback', icon: 'bug', title: 'Bugs and ideas', text: 'Reports from listeners', badge: 'reports', admin: true },
  ] },
  { id: 'system', title: 'System', icon: 'stats', admin: true, tiles: [
    { href: '/admin/server-load', icon: 'stats', title: 'Server load', text: 'Vercel server time: the allowance, protection level, readings, charts and what each feature costs', admin: true },
    { href: '/admin/listening-limits', icon: 'stats', title: 'Listening', text: 'When the player asks "still listening?", when it stops, and sleep hours', admin: true },
    { href: '/admin/stats', icon: 'stats', title: 'Stats', text: 'Listeners, hours and logs', eboard: true },
    { href: '/admin/tests', icon: 'tests', title: 'Tests', text: 'Preview features safely', admin: true },
    { href: '/admin/docs', icon: 'docs', title: 'Information and documentation', text: 'Features, setup guides and reference', admin: true },
    { href: '/admin/expert', icon: 'auto', title: 'Expert settings', text: 'Every setting with its default. You almost never need these', admin: true },
  ] },
]

/** The headings and pages one role may see in the menu, in menu order (Today first). Empty headings are dropped. */
export function menuFor(role: AdminRole): MenuSection[] {
  const admin = role === 'admin'
  const rest = SECTIONS
    .filter(s => admin || !s.admin)
    .map(s => ({ ...s, tiles: s.tiles.filter(t => admin || !t.admin) }))
    .filter(s => s.tiles.length > 0)
  return [TODAY, ...rest]
}

/** Pages E-board can open that sit under an Admin heading: reachable from search and the "More" links on Today, not from the menu. */
export const eboardExtras = (): (MenuTile & { where: string })[] =>
  SECTIONS.filter(s => s.admin).flatMap(s => s.tiles.filter(t => t.eboard).map(t => ({ ...t, where: s.title })))

/** Where an old link or a setting result should open. Every page that existed before is still here. */
export const LEGACY_HASH: Record<string, string> = { onair: 'shows', rules: 'customize', tools: 'system', settings: 'system', messages: 'customize' }

export interface SearchEntry { href: string; icon: OpsIcon; title: string; text: string; where: string; badge?: BadgeKey; setting?: boolean }
/** Something searchable that is not a menu page: a setting (admins only). */
export interface ExtraEntry { href: string; title: string; text: string; where: string; keywords?: string }

/** Every page the role may open, plus the extra entries (settings), as one flat list. */
export function searchEntries(role: AdminRole, extra: ExtraEntry[] = []): SearchEntry[] {
  const pages = [
    ...menuFor(role).flatMap(s => s.tiles.map(t => ({ href: t.href, icon: t.icon, title: t.title, text: t.text, where: s.title, badge: t.badge }))),
    ...(role === 'director' ? eboardExtras().map(t => ({ href: t.href, icon: t.icon, title: t.title, text: t.text, where: 'More', badge: t.badge })) : []),
  ]
  const settings = role === 'admin' ? extra.map(e => ({ href: e.href, icon: 'auto' as OpsIcon, title: e.title, text: e.text, where: e.where, setting: true, keywords: e.keywords ?? '' })) : []
  return [...pages, ...settings]
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
