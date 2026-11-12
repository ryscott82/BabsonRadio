import type { OpsIcon } from '@/components/admin/OpsIcons'

// The admin menu: seven headings, every existing page grouped under one. Pure (no React), so the role rules and the search are tested.
// Directors see Today, Shows, Music, People and Messages (and inside them only the pages a director may open).
// Admins also see Settings and System. Hidden, not greyed out: a director never sees what they cannot use.

export type AdminRole = 'director' | 'admin'
export type BadgeKey = 'pending' | 'reports'
export interface MenuTile { href: string; icon: OpsIcon; title: string; text: string; admin?: boolean; badge?: BadgeKey }
export interface MenuSection { id: string; title: string; icon: OpsIcon; admin?: boolean; tiles: MenuTile[] }

/** Today is the page itself (the overview), so it has no tiles. */
export const TODAY: MenuSection = { id: 'home', title: 'Today', icon: 'radio', tiles: [] }

export const SECTIONS: MenuSection[] = [
  { id: 'shows', title: 'Shows', icon: 'schedule', tiles: [
    { href: '/admin/schedule', icon: 'schedule', title: 'Schedule', text: 'See and edit what is on air, and one-time events' },
    { href: '/admin/slots', icon: 'slots', title: 'Show requests', text: 'Approve or decline requests', badge: 'pending' },
    { href: '/admin/show-updates', icon: 'updates', title: 'Show changes', text: 'Review edits hosts made' },
    // Directors could open these two before, and System is Admin only, so they stay here where a director can still reach them.
    { href: '/admin/stats', icon: 'stats', title: 'Stats', text: 'Listeners, hours and logs' },
    { href: '/admin/booth', icon: 'users', title: 'Studio PC log', text: 'Who signed in at the studio and went live' },
  ] },
  { id: 'music', title: 'Music', icon: 'library', tiles: [
    { href: '/admin/library', icon: 'library', title: 'Episodes', text: 'Add and remove episodes' },
    { href: '/admin/music-library', icon: 'auto', title: 'Music library', text: 'Fix titles, covers, beats and loudness', admin: true },
    { href: '/admin/media', icon: 'library', title: 'Music uploads', text: 'Add .mp3 files, folders and playlists', admin: true },
    { href: '/admin/autoschedule', icon: 'auto', title: 'Auto DJ', text: 'Playlists, times and how often', admin: true },
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
  ] },
  { id: 'messages', title: 'Messages', icon: 'bell', tiles: [
    { href: '/admin/notify', icon: 'bell', title: 'Send notification', text: 'Message everyone or a group', admin: true },
    { href: '/admin/launch-email', icon: 'mail', title: 'Launch email', text: 'Preview and send', admin: true },
    { href: '/admin/feedback', icon: 'bug', title: 'Bugs and ideas', text: 'Reports from listeners', badge: 'reports' },
    { href: '/admin/site-text', icon: 'updates', title: 'Page text', text: 'Edit the words on About and other pages', admin: true },
    { href: '/admin/blocked-words', icon: 'blocked', title: 'Blocked words', text: 'Words that are filtered out', admin: true },
  ] },
  { id: 'settings', title: 'Settings', icon: 'auto', admin: true, tiles: [
    { href: '/admin/settings', icon: 'auto', title: 'All settings', text: 'Everyday, Customize, and Defaults and safety, each with its default and a Reset', admin: true },
    { href: '/admin/listening-limits', icon: 'stats', title: 'Listening limits', text: 'Daily limits and sleep hours for students and guests', admin: true },
  ] },
  { id: 'system', title: 'System', icon: 'stats', admin: true, tiles: [
    { href: '/admin/server-load', icon: 'stats', title: 'Server load', text: 'Vercel server time: readings, charts, forecast, limits and what each feature costs', admin: true },
    { href: '/admin/tests', icon: 'tests', title: 'Tests', text: 'Preview features safely', admin: true },
    { href: '/admin/docs', icon: 'docs', title: 'Information and documentation', text: 'Features, setup guides and reference', admin: true },
    { href: '/admin/easter-eggs', icon: 'eggs', title: 'Easter eggs', text: 'Hidden surprises on the site', admin: true },
  ] },
]

/** The headings and pages one role may see, in menu order (Today first). Empty headings are dropped. */
export function menuFor(role: AdminRole): MenuSection[] {
  const admin = role === 'admin'
  const rest = SECTIONS
    .filter(s => admin || !s.admin)
    .map(s => ({ ...s, tiles: s.tiles.filter(t => admin || !t.admin) }))
    .filter(s => s.tiles.length > 0)
  return [TODAY, ...rest]
}

export interface SearchEntry { href: string; icon: OpsIcon; title: string; text: string; where: string; badge?: BadgeKey; setting?: boolean }
/** Something searchable that is not a menu page: a setting (admins only). */
export interface ExtraEntry { href: string; title: string; text: string; where: string; keywords?: string }

/** Every page the role may open, plus the extra entries (settings), as one flat list. */
export function searchEntries(role: AdminRole, extra: ExtraEntry[] = []): SearchEntry[] {
  const pages = menuFor(role).flatMap(s => s.tiles.map(t => ({ href: t.href, icon: t.icon, title: t.title, text: t.text, where: s.title, badge: t.badge })))
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
