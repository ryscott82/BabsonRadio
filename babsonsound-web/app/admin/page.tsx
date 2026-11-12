'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import OpsIcon from '@/components/admin/OpsIcons'
import CriticalStrip from '@/components/admin/today/CriticalStrip'
import Controls from '@/components/admin/today/Controls'
import ComingUp from '@/components/admin/today/ComingUp'
import NeedsApproval from '@/components/admin/today/NeedsApproval'
import { FROM_KEY, NOTIFICATIONS_HREF, eboardExtras, fromNote, menuFor, resolveHash, searchMenu, tabHref, type AdminRole, type BadgeKey, type ExtraEntry, type SearchEntry, type TabId } from '@/lib/adminMenu'
import { SETTING_UI } from '@/lib/settingsDefs'
import { settingHref } from '@/lib/settingsHome'
import { roleLabel } from '@/lib/roleLabel'
import { ALERTS_URL, unreadCount } from '@/lib/notificationsPage'
import { DASHBOARD_URL, startPolling, type Critical, type NextRow, type PendingRow } from '@/lib/todayPage'

interface Dash {
  radioConnected: boolean
  next: NextRow[]
  pending: PendingRow[]
  pendingTotal: number
  critical: Critical
}

/** Settings are searchable from the menu (admins only). A result opens the page the setting lives on, with that row highlighted. */
const SETTING_ENTRIES: ExtraEntry[] = Object.entries(SETTING_UI).map(([key, u]) => ({ href: settingHref(key), title: u.label ?? key, text: u.help, where: `Settings · ${u.group}`, keywords: u.keywords }))

// The Settings home: a critical strip (only when something is wrong), the controls as icon buttons, what is coming up, and what needs approval.
// ONE data call, GET /api/admin/dashboard, every 60 seconds while this tab is visible and never faster. Each part shows a grey placeholder of its
// own size until its numbers arrive. The alerts are read once when the page opens, for the numbers on the Notifications and Advanced tabs (no polling).
// Switching tab pushes a history entry (the address hash), so the browser Back button returns to the tab before.
export default function AdminPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [dash, setDash] = useState<Dash | null>(null)
  const [failed, setFailed] = useState(false)
  const [reports, setReports] = useState(0)
  const [alerts, setAlerts] = useState(0)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabId>(() => (typeof window === 'undefined' ? 'home' : resolveHash(window.location.hash)))
  const role: AdminRole = isAdmin ? 'admin' : 'director'

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => { apiGet<Dash>(DASHBOARD_URL).then(d => { setDash(d); setFailed(false) }).catch(() => setFailed(true)) }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    return startPolling(load, {
      hidden: () => document.hidden,
      every: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) },
    })
  }, [user, isDirector, load])
  useEffect(() => { // the numbers on the tabs: one read, no polling
    if (!user || !isDirector) return
    apiGet<{ items: unknown[]; newReports: number | null }>(ALERTS_URL).then(a => { setAlerts(unreadCount(a.items)); setReports(a.newReports ?? 0) }).catch(() => {})
  }, [user, isDirector])
  useEffect(() => { // the address decides the tab: old links (#people, #music, #system ...) and the browser Back button both land here
    if (!user || !isDirector) return
    const sync = () => {
      const id = resolveHash(window.location.hash, role)
      if (id === 'notifications') { router.replace(NOTIFICATIONS_HREF); return }
      setTab(id); setQuery('')
    }
    queueMicrotask(sync)
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync) }
  }, [user, isDirector, role, router])

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const menu = menuFor(role)
  const badges: Record<BadgeKey, number> = { pending: dash?.pendingTotal ?? 0, reports, alerts }
  const badgeOf = (b?: BadgeKey) => (b ? badges[b] : 0)

  const words = query.trim()
  const found = words ? searchMenu(role, words, SETTING_ENTRIES) : []
  const current = menu.find(g => g.id === tab && g.id !== 'home' && !g.href)
  const showHome = !words && !current
  const pick = (id: TabId) => {
    setQuery('')
    if (id === 'notifications') { router.push(NOTIFICATIONS_HREF); return }
    if (id === tab) return
    setTab(id)
    try { history.pushState(null, '', tabHref(id)) } catch { /* ignore */ } // a new history entry: Back returns to the tab before
  }
  /** Opening a page (from a tab or from search) remembers the tab the person was on, so that page's Back bar returns there. */
  const remember = (href: string) => { try { sessionStorage.setItem(FROM_KEY, fromNote(tab, href)) } catch { /* ignore */ } }

  const tileLink = (t: { href: string; icon: SearchEntry['icon']; title: string; text: string; badge?: BadgeKey }) => (
    <Link key={t.href} href={t.href} onClick={() => remember(t.href)} className="ops-tile group flex gap-4 p-2 -m-2 items-start">
      <span className="ops-tile-icon relative shrink-0"><OpsIcon name={t.icon} size={52} />
        {badgeOf(t.badge) > 0 && <span className="absolute -top-2 -right-2 min-w-7 h-7 px-1.5 rounded-full bg-white text-[#0f5233] text-base font-bold flex items-center justify-center">{badgeOf(t.badge)}</span>}
      </span>
      <span className="min-w-0 pt-1">
        <span className="block text-2xl font-light leading-tight">{t.title}</span>
        <span className="block text-base leading-snug mt-1 opacity-95 max-w-[60ch]">{t.text}</span>
      </span>
    </Link>
  )
  const side = 'flex items-center gap-3 text-left px-3 py-2.5 border border-transparent'
  const countBubble = (n: number) => n > 0 && <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-[#0f5233] text-base font-bold flex items-center justify-center">{n}</span>

  const header = (
    <header className="flex flex-wrap items-center gap-4">
      <span className="ops-tile-icon !w-14 !h-14 shrink-0"><OpsIcon name="radio" size={34} /></span>
      <div>
        <h1 className="text-4xl font-light leading-tight">Settings</h1>
        <p className="text-base opacity-90">{roleLabel(role)}{dash && !dash.radioConnected && isAdmin ? ' · Radio not connected' : ''}</p>
      </div>
      <Link href="/" className="ops-btn ml-auto min-h-11 inline-flex items-center px-4">Back to site</Link>
    </header>
  )

  const nav = (
    <nav aria-label="Admin sections" className="space-y-3 lg:sticky lg:top-6">
      <input type="search" className="ops-field w-full min-h-11" value={query} onChange={e => setQuery(e.target.value)} placeholder={isAdmin ? 'Search pages and settings' : 'Search Settings'} aria-label={isAdmin ? 'Search pages and settings' : 'Search Settings'} />
      <div className="flex flex-wrap lg:flex-col gap-2 lg:gap-1">
        {menu.map(g => {
          const active = !words && (g.id === 'home' ? showHome : g.id === tab)
          const n = g.badge ? badgeOf(g.badge) : g.tiles.reduce((a, t) => a + badgeOf(t.badge), 0)
          const inner = <><OpsIcon name={g.icon} size={22} /><span className="flex-1">{g.title}</span>{countBubble(n)}</>
          const cls = `ops-btn ${side} min-h-11 lg:w-full no-underline ${active ? 'underline underline-offset-4' : ''}`
          return g.href
            ? <Link key={g.id} href={g.href} className={cls}>{inner}</Link>
            : <button key={g.id} type="button" onClick={() => pick(g.id)} aria-current={active ? 'page' : undefined} className={cls}>{inner}</button>
        })}
      </div>
    </nav>
  )

  const results = words && (
    <section aria-label="Search results" className="space-y-4">
      <h2 className="text-3xl font-light">Results for &ldquo;{words}&rdquo;</h2>
      {found.length ? (
        <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-5">
          {found.map(e => (
            <div key={e.href} className="space-y-1">
              {tileLink(e)}
              <p className="text-base opacity-80 pl-[4.5rem]">{e.where}</p>
            </div>
          ))}
        </div>
      ) : <p className="text-base opacity-90">Nothing matches. Try a shorter word.</p>}
    </section>
  )

  const tabView = !words && current && (
    <section aria-label={current.title} className="space-y-6">
      <h2 className="text-3xl font-light">{current.title}</h2>
      {current.groups.map((g, i) => (
        <div key={g.title ?? i} className="space-y-4">
          {g.title && <h3 className="text-2xl font-light border-b border-white/30 pb-1">{g.title}</h3>}
          <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-5">{g.tiles.map(t => tileLink(t))}</div>
        </div>
      ))}
    </section>
  )

  if (!showHome) {
    return (
      <div className="ops-hub">
        <div className="px-5 lg:px-8 py-6 space-y-6">
          {header}
          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-x-8 gap-y-6 items-start">
            {nav}
            <div className="min-w-0">{results}{tabView}</div>
          </div>
        </div>
      </div>
    )
  }

  // Home. Wide screens: three columns (menu | controls and coming up | needs approval, which runs the full height and scrolls inside itself).
  // Small screens: header, menu, controls, then Needs approval, then Coming up.
  const more = eboardExtras()
  return (
    <div className="ops-hub">
      <div className="px-5 lg:px-8 py-6 grid gap-x-8 gap-y-6 items-start lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_26rem] xl:!pr-0 xl:!py-0">
        <div className="space-y-6 lg:col-span-2 xl:col-span-2 xl:col-start-1 xl:row-start-1 xl:pt-6">
          {header}
          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-x-8 gap-y-6 items-start">
            {nav}
            <div className="min-w-0 space-y-6" data-testid="home-main">
              <CriticalStrip critical={dash?.critical} role={role} />
              {failed && !dash && <p role="alert" className="ops-card p-4 text-base">Could not load. It will try again in a minute.</p>}
              <Controls role={role} />
            </div>
          </div>
        </div>
        <aside aria-label="Needs approval column" className="min-w-0 lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-0 xl:self-start">
          <NeedsApproval rows={dash ? dash.pending : null} total={dash?.pendingTotal ?? 0} onChanged={load} />
        </aside>
        <div className="min-w-0 lg:col-span-2 lg:col-start-1 xl:col-span-2 xl:col-start-1 xl:row-start-2 xl:pb-6 space-y-6">
          <div className="lg:pl-[252px]"><ComingUp rows={dash ? dash.next : null} /></div>
          {more.length > 0 && (
            <nav aria-label="More" className="flex flex-wrap items-center gap-3 lg:pl-[252px]">
              <span className="text-base opacity-90">More:</span>
              {more.map(m => <Link key={m.href} href={m.href} className="ops-btn px-4 min-h-11 inline-flex items-center no-underline">{m.title}</Link>)}
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
