'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import OpsIcon from '@/components/admin/OpsIcons'
import { FROM_KEY, fromNote, menuFor, resolveHash, searchMenu, tabHref, tabOfPath, type AdminRole, type BadgeKey, type ExtraEntry, type MenuTab, type TabId } from '@/lib/adminMenu'
import { ALERTS_URL, unreadCount } from '@/lib/notificationsPage'
import { SETTING_UI } from '@/lib/settingsDefs'
import { settingHref } from '@/lib/settingsHome'

/** Sent on the window when the Settings page should re-read which tab the address names. */
export const TAB_EVENT = 'admin-tab'

const Badges = createContext<Record<BadgeKey, number>>({ pending: 0, reports: 0, alerts: 0 })
export const useAdminBadges = () => useContext(Badges)

/** Settings are searchable from the menu (admins only). A result opens the page the setting lives on, with that row highlighted. */
const SETTING_ENTRIES: ExtraEntry[] = Object.entries(SETTING_UI).map(([key, u]) => ({ href: settingHref(key), title: u.label ?? key, text: u.help, where: `Settings · ${u.group}`, keywords: u.keywords }))

/**
 * The left menu, on every admin page and every view: search, the tabs, and the way back to the site. It is drawn by the admin layout, so it never goes away
 * when a page opens. The alerts are read once when it appears, for the numbers on the tabs (no polling).
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, isDirector } = useAuth()
  const path = usePathname()
  const router = useRouter()
  const role: AdminRole = isAdmin ? 'admin' : 'director'
  const [badges, setBadges] = useState<Record<BadgeKey, number>>({ pending: 0, reports: 0, alerts: 0 })
  const [query, setQuery] = useState('')
  const [hashTab, setHashTab] = useState<TabId>('home')

  useEffect(() => {
    if (!user || !isDirector) return
    apiGet<{ items: unknown[]; newReports: number | null; pendingRequests: number }>(ALERTS_URL)
      .then(a => setBadges({ alerts: unreadCount(a.items), reports: a.newReports ?? 0, pending: a.pendingRequests ?? 0 })).catch(() => {})
  }, [user, isDirector])
  useEffect(() => { // which tab the address names, for the highlight on the Settings page
    const sync = () => setHashTab(resolveHash(window.location.hash, role))
    queueMicrotask(sync)
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); window.addEventListener(TAB_EVENT, sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); window.removeEventListener(TAB_EVENT, sync) }
  }, [role])

  const menu = useMemo(() => menuFor(role), [role])
  const found = useMemo(() => (query.trim() ? searchMenu(role, query, SETTING_ENTRIES).slice(0, 12) : []), [role, query])
  if (!user || !isDirector) return <>{children}</>

  const onHub = path === '/admin'
  const current: TabId = onHub ? hashTab : (menu.some(m => m.id === tabOfPath(path)) ? tabOfPath(path) : 'home')
  const go = (g: MenuTab) => {
    setQuery('')
    if (g.href) { router.push(g.href); return }
    if (onHub) { // a new history entry, so the browser Back button returns to the tab before
      if (hashTab !== g.id) { try { history.pushState(null, '', tabHref(g.id)) } catch { /* ignore */ } }
      window.dispatchEvent(new Event(TAB_EVENT))
    } else router.push(tabHref(g.id))
  }
  const remember = (href: string) => { try { sessionStorage.setItem(FROM_KEY, fromNote(current, href)) } catch { /* ignore */ } }
  const count = (g: MenuTab) => (g.badge ? badges[g.badge] : g.tiles.reduce((a, t) => a + (t.badge ? badges[t.badge] : 0), 0))

  return (
    <Badges.Provider value={badges}>
      <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] items-start">
        <aside className="px-5 lg:pl-8 lg:pr-4 pt-5 lg:pt-6 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto">
          <nav aria-label="Admin sections" className="space-y-3">
            <input type="search" className="ops-field w-full min-h-11" value={query} onChange={e => setQuery(e.target.value)} placeholder={isAdmin ? 'Search pages and settings' : 'Search Settings'} aria-label={isAdmin ? 'Search pages and settings' : 'Search Settings'} />
            {query.trim() && (
              <ul aria-label="Search results" className="ops-card p-2 space-y-1">
                {found.length ? found.map(e => (
                  <li key={e.href}>
                    <Link href={e.href} onClick={() => { remember(e.href); setQuery('') }} className="block px-2 py-1.5 text-base no-underline hover:bg-black/20">
                      <span className="block">{e.title}</span><span className="block opacity-80">{e.where}</span>
                    </Link>
                  </li>
                )) : <li className="px-2 py-1.5 text-base">Nothing matches. Try a shorter word.</li>}
              </ul>
            )}
            <div className="flex flex-wrap lg:flex-col gap-2 lg:gap-1">
              {menu.map(g => {
                const active = g.id === current
                const n = count(g)
                return (
                  <button key={g.id} type="button" onClick={() => go(g)} aria-current={active ? 'page' : undefined}
                          className={`ops-btn flex items-center gap-3 text-left px-3 py-2.5 border border-transparent min-h-11 lg:w-full ${active ? 'underline underline-offset-4' : ''}`}>
                    <OpsIcon name={g.icon} size={22} />
                    <span className="flex-1">{g.title}</span>
                    {n > 0 && <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-[#0f5233] text-base font-bold flex items-center justify-center">{n}</span>}
                  </button>
                )
              })}
              <Link href="/" className="ops-btn min-h-11 inline-flex items-center px-3 lg:w-full no-underline lg:mt-3">Back to site</Link>
            </div>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Badges.Provider>
  )
}
