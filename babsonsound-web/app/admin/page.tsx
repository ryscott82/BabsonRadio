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
import { eboardExtras, LEGACY_HASH, menuFor, searchMenu, type AdminRole, type BadgeKey, type ExtraEntry, type SearchEntry } from '@/lib/adminMenu'
import { SETTING_UI } from '@/lib/settingsDefs'
import { settingHref } from '@/lib/settingsHome'
import { roleLabel } from '@/lib/roleLabel'
import { DASHBOARD_URL, startPolling, type Critical, type NextRow, type PendingRow } from '@/lib/todayPage'

interface Dash {
  radioConnected: boolean
  nowPlaying: { configured: boolean; song: string; listeners: number; isLive: boolean; streamer: string; playlist: string }
  onAir: { title: string; isShow: boolean; endAt: number }
  next: NextRow[]
  pending: PendingRow[]
  pendingTotal: number
  critical: Critical
  announcement: { text: string } | null
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
/** Old links like /admin#onair keep working. */
const LEGACY = LEGACY_HASH
/** Settings are searchable from the menu (admins only). A result opens the page the setting lives on, with that row highlighted. */
const SETTING_ENTRIES: ExtraEntry[] = Object.entries(SETTING_UI).map(([key, u]) => ({ href: settingHref(key), title: u.label ?? key, text: u.help, where: `Settings · ${u.group}`, keywords: u.keywords }))

/** A grey bar the size of the text that will replace it, so cards keep their height while the numbers arrive. */
const Bar = ({ w = 'w-2/3' }: { w?: string }) => <div className={`h-6 ${w} bg-white/25 motion-safe:animate-pulse`} aria-hidden />

// Today: a critical strip (only when something is wrong), what is on air, the controls, what is coming up, and what needs approval.
// ONE data call, GET /api/admin/dashboard, every 60 seconds while this tab is visible and never faster. Each part shows a grey placeholder of its
// own size until its numbers arrive (no page-wide loading gate). Admins also read the bug count once, for the badge on Bugs and ideas.
export default function AdminPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [dash, setDash] = useState<Dash | null>(null)
  const [failed, setFailed] = useState(false)
  const [reports, setReports] = useState(0)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(() => { // which section is open (kept in the address, so refresh and back work)
    if (typeof window === 'undefined') return 'home'
    const h = window.location.hash.slice(1)
    return LEGACY[h] ?? (h || 'home')
  })

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => { apiGet<Dash>(DASHBOARD_URL).then(d => { setDash(d); setFailed(false) }).catch(() => setFailed(true)) }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    return startPolling(load, {
      hidden: () => document.hidden,
      every: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) },
    })
  }, [user, isDirector, load])
  useEffect(() => { // the bug badge: one read, no polling, Admins only (Bugs and ideas is an Admin page)
    if (!user || !isAdmin) return
    apiGet<{ newReports: number | null }>('/api/admin/alerts').then(a => setReports(a.newReports ?? 0)).catch(() => {})
  }, [user, isAdmin])

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const role: AdminRole = isAdmin ? 'admin' : 'director'
  const menu = menuFor(role)
  const badges: Record<BadgeKey, number> = { pending: dash?.pendingTotal ?? 0, reports }
  const badgeOf = (b?: BadgeKey) => (b ? badges[b] : 0)

  const words = query.trim()
  const found = words ? searchMenu(role, words, SETTING_ENTRIES) : []
  const current = menu.find(g => g.id === tab && g.id !== 'home')
  const showHome = !words && !current
  const pick = (id: string) => { setTab(id); setQuery(''); try { history.replaceState(null, '', id === 'home' ? '/admin' : `#${id}`) } catch { /* ignore */ } }

  const tileLink = (t: { href: string; icon: SearchEntry['icon']; title: string; text: string; badge?: BadgeKey }) => (
    <Link key={t.href} href={t.href} className="ops-tile group flex gap-4 p-2 -m-2 items-start">
      <span className="ops-tile-icon relative shrink-0"><OpsIcon name={t.icon} size={52} />
        {badgeOf(t.badge) > 0 && <span className="absolute -top-2 -right-2 min-w-7 h-7 px-1.5 rounded-full bg-white text-[#0f5233] text-base font-bold flex items-center justify-center">{badgeOf(t.badge)}</span>}
      </span>
      <span className="min-w-0 pt-1">
        <span className="block text-2xl font-light leading-tight">{t.title}</span>
        <span className="block text-base leading-snug mt-1 opacity-95">{t.text}</span>
      </span>
    </Link>
  )
  const side = 'flex items-center gap-3 text-left px-3 py-2.5 border border-transparent'

  const card = 'ops-card p-4 min-w-0 min-h-[6.5rem]'
  const now = (
    <div className="grid sm:grid-cols-3 gap-3" aria-busy={!dash} aria-label="Now">
      <div className={card}>
        <p className="text-base opacity-90">On air now</p>
        {dash ? <><p className="text-xl truncate">{dash.onAir.title || 'Nothing scheduled'}</p><p className="text-base opacity-80">{dash.onAir.endAt ? `until ${clock(dash.onAir.endAt)}` : ''}</p></> : <div className="pt-2"><Bar /></div>}
      </div>
      <div className={card}>
        <p className="text-base opacity-90">{dash ? (dash.nowPlaying.isLive ? `Live · ${dash.nowPlaying.streamer}` : dash.nowPlaying.playlist ? `Playing · ${dash.nowPlaying.playlist}` : 'Playing') : 'Playing'}</p>
        {dash ? <p className="text-xl truncate">{dash.nowPlaying.song || '–'}</p> : <div className="pt-2"><Bar /></div>}
      </div>
      <div className={card}>
        <p className="text-base opacity-90">Listeners now</p>
        {dash ? <p className="text-3xl tabular-nums">{dash.nowPlaying.listeners}</p> : <div className="pt-2"><Bar w="w-1/4" /></div>}
      </div>
    </div>
  )
  const more = eboardExtras()
  const todayView = (
    <div className="space-y-6">
      <CriticalStrip critical={dash?.critical} role={role} />
      {failed && !dash && <p role="alert" className="ops-card p-4 text-base">Could not load. It will try again in a minute.</p>}
      {dash && !dash.radioConnected && isAdmin && <p className="text-base opacity-90">Radio not connected.</p>}
      {now}
      <Controls role={role} />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] gap-6 items-start">
        <div className="min-w-0 xl:order-1 order-2"><ComingUp rows={dash ? dash.next : null} /></div>
        <div className="min-w-0 xl:order-2 order-1"><NeedsApproval rows={dash ? dash.pending : null} total={dash?.pendingTotal ?? 0} onChanged={load} /></div>
      </div>
      {more.length > 0 && (
        <nav aria-label="More" className="flex flex-wrap items-center gap-3">
          <span className="text-base opacity-90">More:</span>
          {more.map(m => <Link key={m.href} href={m.href} className="ops-btn px-4 min-h-11 inline-flex items-center no-underline">{m.title}</Link>)}
        </nav>
      )}
    </div>
  )

  return (
    <div className="ops-hub">
      <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header className="flex flex-wrap items-center gap-4">
          <span className="ops-tile-icon !w-16 !h-16 shrink-0"><OpsIcon name="radio" size={40} /></span>
          <div>
            <h1 className="text-4xl font-light leading-tight">Settings</h1>
            <p className="text-base opacity-90">{isAdmin ? roleLabel('admin') : roleLabel('director')}{dash && !dash.radioConnected && isAdmin ? ' · Radio not connected' : ''}</p>
          </div>
          <Link href="/" className="ops-btn ml-auto min-h-11 inline-flex items-center px-4">Back to site</Link>
        </header>

        <div className="grid lg:grid-cols-[280px_1fr] gap-x-10 gap-y-6 items-start">
          <nav aria-label="Admin sections" className="space-y-3 lg:sticky lg:top-6">
            <input type="search" className="ops-field w-full min-h-11" value={query} onChange={e => setQuery(e.target.value)} placeholder={isAdmin ? 'Search pages and settings' : 'Search Settings'} aria-label={isAdmin ? 'Search pages and settings' : 'Search Settings'} />
            <div className="flex flex-wrap lg:flex-col gap-2 lg:gap-1">
              {menu.map(g => {
                const active = !words && (g.id === 'home' ? showHome : g.id === tab)
                const n = g.tiles.reduce((a, t) => a + badgeOf(t.badge), 0)
                return (
                  <button key={g.id} type="button" onClick={() => pick(g.id)} aria-current={active ? 'page' : undefined}
                          className={`ops-btn ${side} min-h-11 lg:w-full ${active ? 'underline underline-offset-4' : ''}`}>
                    <OpsIcon name={g.icon} size={22} />
                    <span className="flex-1">{g.title}</span>
                    {n > 0 && <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-[#0f5233] text-base font-bold flex items-center justify-center">{n}</span>}
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0 space-y-8">
            {words && (
              <section aria-label="Search results" className="space-y-4">
                <h2 className="text-3xl font-light">Results for &ldquo;{words}&rdquo;</h2>
                {found.length ? (
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
                    {found.map(e => (
                      <div key={e.href} className="space-y-1">
                        {tileLink(e)}
                        <p className="text-base opacity-80 pl-[4.5rem]">{e.where}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-base opacity-90">Nothing matches. Try a shorter word.</p>}
              </section>
            )}

            {!words && current && (
              <section aria-label={current.title} className="space-y-4">
                <h2 className="text-3xl font-light">{current.title}</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">{current.tiles.map(tileLink)}</div>
              </section>
            )}

            {showHome && todayView}
          </div>
        </div>
      </div>
    </div>
  )
}
