'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import OpsIcon from '@/components/admin/OpsIcons'
import { TAB_EVENT, useAdminBadges } from '@/components/admin/AdminShell'
import CriticalStrip from '@/components/admin/today/CriticalStrip'
import Controls from '@/components/admin/today/Controls'
import ComingUp from '@/components/admin/today/ComingUp'
import NeedsApproval from '@/components/admin/today/NeedsApproval'
import { FROM_KEY, NOTIFICATIONS_HREF, eboardExtras, fromNote, menuFor, resolveHash, type AdminRole, type BadgeKey, type SearchEntry, type TabId } from '@/lib/adminMenu'
import { roleLabel } from '@/lib/roleLabel'
import { DASHBOARD_URL, startPolling, type Critical, type NextRow, type PendingRow } from '@/lib/todayPage'

interface Dash {
  radioConnected: boolean
  next: NextRow[]
  pending: PendingRow[]
  pendingTotal: number
  critical: Critical
}

// The Settings home: a critical strip (only when something is wrong), the controls as icon buttons, what is coming up, and what needs approval.
// ONE data call, GET /api/admin/dashboard, every 60 seconds while this tab is visible and never faster. Each part shows a grey placeholder of its
// own size until its numbers arrive. The left menu (tabs, search, numbers) is drawn by the admin layout, so it stays on every page; it pushes a history entry when a tab is chosen.
export default function AdminPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [dash, setDash] = useState<Dash | null>(null)
  const [failed, setFailed] = useState(false)
  const badges = useAdminBadges()
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
  useEffect(() => { // the address decides the tab: old links (#people, #music, #system ...) and the browser Back button both land here
    if (!user || !isDirector) return
    const sync = () => {
      const id = resolveHash(window.location.hash, role)
      if (id === 'notifications') { router.replace(NOTIFICATIONS_HREF); return }
      setTab(id)
    }
    queueMicrotask(sync)
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); window.addEventListener(TAB_EVENT, sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); window.removeEventListener(TAB_EVENT, sync) }
  }, [user, isDirector, role, router])

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const menu = menuFor(role)
  const badgeOf = (b?: BadgeKey) => (b ? badges[b] : 0)
  const current = menu.find(g => g.id === tab && g.id !== 'home' && !g.href)

  /** Opening a page remembers the tab the person was on, so that page's Back bar returns there. */
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

  if (current) {
    return (
      <div className="ops-hub">
        <section aria-label={current.title} className="px-5 lg:px-8 py-6 space-y-6">
          <h1 className="text-4xl font-light leading-tight">{current.title}</h1>
          {current.groups.map((g, i) => (
            <div key={g.title ?? i} className="space-y-4">
              {g.title && <h2 className="text-2xl font-light border-b border-white/30 pb-1">{g.title}</h2>}
              <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-5">{g.tiles.map(t => tileLink(t))}</div>
            </div>
          ))}
        </section>
      </div>
    )
  }

  // Home. Wide screens: two columns (controls and coming up | needs approval, which runs the full height and scrolls inside itself).
  // Small screens: header, controls, then Needs approval, then Coming up. The left menu comes from the admin layout.
  const more = eboardExtras()
  return (
    <div className="ops-hub">
      <div className="px-5 lg:px-8 py-6 grid gap-x-8 gap-y-6 items-start xl:grid-cols-[minmax(0,1fr)_26rem] xl:!pr-0 xl:!py-0">
        <div className="space-y-6 min-w-0 xl:col-start-1 xl:row-start-1 xl:pt-6" data-testid="home-main">
          <header className="flex flex-wrap items-center gap-4">
            <span className="ops-tile-icon !w-14 !h-14 shrink-0"><OpsIcon name="radio" size={34} /></span>
            <div>
              <h1 className="text-4xl font-light leading-tight">Settings</h1>
              <p className="text-base opacity-90">{roleLabel(role)}{dash && !dash.radioConnected && isAdmin ? ' · Radio not connected' : ''}</p>
            </div>
          </header>
          <CriticalStrip critical={dash?.critical} role={role} />
          {failed && !dash && <p role="alert" className="ops-card p-4 text-base">Could not load. It will try again in a minute.</p>}
          <Controls role={role} />
        </div>
        <aside aria-label="Needs approval column" className="min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-0 xl:self-start">
          <NeedsApproval rows={dash ? dash.pending : null} total={dash?.pendingTotal ?? 0} onChanged={load} />
        </aside>
        <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-2 xl:pb-6">
          <ComingUp rows={dash ? dash.next : null} />
          {more.length > 0 && (
            <nav aria-label="More" className="flex flex-wrap items-center gap-3">
              <span className="text-base opacity-90">More:</span>
              {more.map(m => <Link key={m.href} href={m.href} className="ops-btn px-4 min-h-11 inline-flex items-center no-underline">{m.title}</Link>)}
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
