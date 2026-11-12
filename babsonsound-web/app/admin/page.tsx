'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiGet } from '@/lib/auth'
import StationPanel from '@/components/admin/StationPanel'
import Notifications, { type Notice } from '@/components/admin/Notifications'
import OpsIcon from '@/components/admin/OpsIcons'
import { menuFor, searchMenu, type AdminRole, type BadgeKey, type ExtraEntry, type SearchEntry } from '@/lib/adminMenu'
import { SETTINGS } from '@/lib/settingsDefs'

interface Alerts {
  items: Notice[]; dismissedCount: number
  pendingRequests: number; newReports: number | null
  deadAir?: { active: boolean; since: number; detail: string; monitorAgeSec: number | null }
  cancellations: { id: string; title: string; requesterName: string; startAt: number; cancelledAt: number; reason: string; wasApproved: boolean }[]
}
interface Dash {
  radioConnected: boolean
  nowPlaying: { configured: boolean; song: string; listeners: number; isLive: boolean; streamer: string; playlist: string }
  onAir: { title: string; isShow: boolean; endAt: number }
  next: { title: string; startAt: number; endAt: number; source: string }[]
  announcement: { text: string } | null
  last24h: { sessions: number; hours: number }
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
/** Old links like /admin#onair keep working. */
const LEGACY: Record<string, string> = { onair: 'shows', rules: 'settings', tools: 'system' }
/** Settings are searchable from the menu (admins only) and open on the Settings page with that row highlighted. */
const SETTING_ENTRIES: ExtraEntry[] = SETTINGS.map(s => ({ href: `/admin/settings?focus=${encodeURIComponent(s.id)}`, title: s.label, text: s.help, where: `Settings · ${s.group}`, keywords: s.keywords }))

/** A grey bar the size of the text that will replace it, so cards keep their height while the numbers arrive. */
const Bar = ({ w = 'w-2/3' }: { w?: string }) => <div className={`h-6 ${w} bg-white/25 motion-safe:animate-pulse`} aria-hidden />

// Today: what needs you, what is on air, three quick actions, the next 24 hours, then the rest of the station controls.
// Nothing waits for anything else: each part shows a grey placeholder of its own size until its numbers arrive. The numbers are read every
// 60 seconds, only while this tab is visible.
export default function AdminPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [dash, setDash] = useState<Dash | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(() => { // which section is open (kept in the address, so refresh and back work)
    if (typeof window === 'undefined') return 'home'
    const h = window.location.hash.slice(1)
    return LEGACY[h] ?? (h || 'home')
  })

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => {
    apiGet<Alerts>('/api/admin/alerts').then(a => { setAlerts(a); setFailed(false) }).catch(() => setFailed(true))
    apiGet<Dash>('/api/admin/dashboard').then(setDash).catch(() => setFailed(true))
  }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    queueMicrotask(load)
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => clearInterval(t)
  }, [user, isDirector, load])

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const role: AdminRole = isAdmin ? 'admin' : 'director'
  const menu = menuFor(role)
  const badges: Record<BadgeKey, number> = { pending: alerts?.pendingRequests ?? 0, reports: alerts?.newReports ?? 0 }
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

  // Needs you: counts that link to the page that fixes them, then the notification list. Empty means all clear.
  const chips = [
    alerts && alerts.pendingRequests > 0 ? { href: '/admin/slots', text: `${alerts.pendingRequests} show request${alerts.pendingRequests === 1 ? '' : 's'} waiting` } : null,
    alerts && (alerts.newReports ?? 0) > 0 ? { href: '/admin/feedback', text: `${alerts.newReports} new bug report${alerts.newReports === 1 ? '' : 's'}` } : null,
  ].filter((c): c is { href: string; text: string } => c !== null)
  const needsYou = !alerts ? (
    <section className="ops-card p-5 min-h-[7.5rem] space-y-3" aria-label="Needs you" aria-busy="true">
      <h2 className="text-2xl font-light">Needs you</h2>
      {failed ? <p className="text-base">Could not load. It will try again in a minute.</p> : <Bar w="w-1/3" />}
    </section>
  ) : (
    <div className="space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chips.map(c => <Link key={c.href} href={c.href} className="ops-btn px-4 min-h-11 inline-flex items-center no-underline">{c.text}</Link>)}
        </div>
      )}
      <Notifications title="Needs you" emptyText={chips.length ? 'Nothing else needs you.' : 'All clear'} items={alerts.items} dismissedCount={alerts.dismissedCount} reload={load} />
    </div>
  )

  const card = 'ops-card p-4 min-w-0 min-h-[6.5rem]'
  const statusCards = (
    <div className="grid sm:grid-cols-3 gap-3" aria-busy={!dash}>
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

  const next24: ReactNode = (
    <section className="ops-card p-5 min-h-[10rem]" aria-label="Next 24 hours" aria-busy={!dash}>
      <h2 className="text-2xl font-light mb-2">Next 24 hours</h2>
      {!dash && <div className="space-y-3 py-1"><Bar w="w-full" /><Bar w="w-5/6" /><Bar w="w-2/3" /></div>}
      {dash && (
        <ul className="text-base divide-y divide-white/25">
          {dash.next.map((n, i) => (
            <li key={i} className="py-2 flex gap-3">
              <span className="tabular-nums w-36 shrink-0 opacity-90">{clock(n.startAt)} – {clock(n.endAt)}</span>
              <span className="truncate">{n.title}</span>
              <span className="text-base opacity-80 ml-auto shrink-0">{n.source === 'auto' ? 'auto' : 'show'}</span>
            </li>
          ))}
          {!dash.next.length && <li className="py-2">Nothing scheduled.</li>}
        </ul>
      )}
    </section>
  )

  return (
    <div className="ops-hub">
      <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header className="flex flex-wrap items-center gap-4">
          <span className="ops-tile-icon !w-16 !h-16 shrink-0"><OpsIcon name="radio" size={40} /></span>
          <div>
            <h1 className="text-4xl font-light leading-tight">Admin Panel</h1>
            <p className="text-base opacity-90">{isAdmin ? 'Admin' : 'Director'}{dash && !dash.radioConnected && isAdmin ? ' · Radio not connected' : ''}</p>
          </div>
          <Link href="/" className="ops-btn ml-auto min-h-11 inline-flex items-center px-4">Back to site</Link>
        </header>

        <div className="grid lg:grid-cols-[280px_1fr] gap-x-10 gap-y-6 items-start">
          <nav aria-label="Admin sections" className="space-y-3 lg:sticky lg:top-6">
            <input type="search" className="ops-field w-full min-h-11" value={query} onChange={e => setQuery(e.target.value)} placeholder={isAdmin ? 'Search pages and settings' : 'Search the admin panel'} aria-label={isAdmin ? 'Search pages and settings' : 'Search the admin panel'} />
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

            {showHome && (
              <div className="space-y-6">
                {needsYou}
                {statusCards}
                {isAdmin ? <StationPanel only="today" between={next24} /> : next24}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
