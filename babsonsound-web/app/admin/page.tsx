'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import StationPanel from '@/components/admin/StationPanel'
import Notifications, { type Notice } from '@/components/admin/Notifications'
import OpsIcon, { type OpsIcon as IconName } from '@/components/admin/OpsIcons'

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

// Radio operations: what is happening now, what needs a decision, and the controls. Everything else is one link away.
export default function AdminPage() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [dash, setDash] = useState<Dash | null>(null)
  // The page is shown all at once: it waits (a second or so) until the alerts, the dashboard numbers and the station controls have all arrived, so nothing pops in later.
  const [got, setGot] = useState({ alerts: false, dash: false, station: false })
  const [waited, setWaited] = useState(false)
  const stationReady = useCallback(() => setGot(g => (g.station ? g : { ...g, station: true })), [])

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => {
    apiGet<Alerts>('/api/admin/alerts').then(setAlerts).catch(() => {}).finally(() => setGot(g => (g.alerts ? g : { ...g, alerts: true })))
    apiGet<Dash>('/api/admin/dashboard').then(setDash).catch(() => {}).finally(() => setGot(g => (g.dash ? g : { ...g, dash: true })))
  }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    queueMicrotask(load)
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    const giveUp = setTimeout(() => setWaited(true), 5000) // if something is slow or fails, show the page anyway
    return () => { clearInterval(t); clearTimeout(giveUp) }
  }, [user, isDirector, load])
  const ready = waited || (got.alerts && got.dash && (got.station || !isAdmin))

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const pending = alerts?.pendingRequests ?? 0
  const reports = alerts?.newReports ?? 0

  const groups: { title: string; tiles: Tile[] }[] = [
    { title: 'Programming', tiles: [
      { href: '/admin/schedule', icon: 'schedule', title: 'Schedule', text: 'See and edit what is on air' },
      { href: '/admin/slots', icon: 'slots', title: 'Show requests', text: 'Approve or decline requests', badge: pending },
      { href: '/admin/training', icon: 'training', title: 'Training', text: 'Check in and certify hosts' },
      { href: '/admin/booth', icon: 'users', title: 'Studio PC log', text: 'Who signed in at the studio and went live' },
      { href: '/admin/show-updates', icon: 'updates', title: 'Show changes', text: 'Review edits hosts made' },
      { href: '/admin/site-text', icon: 'updates', title: 'Page text', text: 'Edit the words on About and other pages', admin: true },
      { href: '/admin/studio-form', icon: 'training', title: 'Studio form', text: 'The training form people open from /studioaccess', admin: true },
      { href: '/admin/library', icon: 'library', title: 'Library', text: 'Add and remove episodes' },
      { href: '/admin/autoschedule', icon: 'auto', title: 'Auto DJ', text: 'Playlists, times and how often', admin: true },
      { href: '/admin/listening-limits', icon: 'stats', title: 'Listening limits', text: 'Daily limits and sleep hours for students and guests', admin: true },
      { href: '/admin/setlists', icon: 'setlists', title: 'Set lists', text: 'Songs planned for shows', admin: true },
      { href: '/admin/easter-eggs', icon: 'eggs', title: 'Easter eggs', text: 'Hidden surprises on the site', admin: true },
      { href: '/admin/blocked-words', icon: 'blocked', title: 'Blocked words', text: 'Words that are filtered out', admin: true },
    ] },
    { title: 'People', tiles: [
      { href: '/admin/users', icon: 'users', title: 'Users and roles', text: 'Find people and give access', admin: true },
      { href: '/admin/feedback', icon: 'bug', title: 'Bugs and ideas', text: 'Reports from listeners', badge: reports },
      { href: '/admin/requests', icon: 'requests', title: 'Song requests', text: 'What listeners asked to hear' },
      { href: '/admin/notify', icon: 'bell', title: 'Send notification', text: 'Message everyone or a group', admin: true },
      { href: '/admin/launch-email', icon: 'mail', title: 'Launch email', text: 'Preview and send', admin: true },
      { href: '/admin/birthdays', icon: 'birthdays', title: 'Birthdays', text: 'Who is celebrating soon', admin: true },
      { href: '/admin/phone-changes', icon: 'phone', title: 'Phone changes', text: 'Approve new numbers', admin: true },
      { href: '/admin/phone-lookup', icon: 'phone', title: 'Phone lookup', text: 'Find the account for a number', admin: true },
    ] },
    { title: 'Data and tools', tiles: [
      { href: '/admin/stats', icon: 'stats', title: 'Stats', text: 'Listeners, hours and logs' },
      { href: '/admin/tests', icon: 'tests', title: 'Tests', text: 'Preview features safely', admin: true },
      { href: '/admin/docs', icon: 'docs', title: 'Information and documentation', text: 'Features, setup guides and reference', admin: true },
    ] },
  ]

  return (
    <div className="ops-hub">
      {!ready && <div className="min-h-[60vh] flex items-center justify-center text-lg opacity-90" role="status">Loading the admin panel…</div>}
      <div className={`max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-8 ${ready ? '' : 'hidden'}`} aria-hidden={!ready}>
        <header className="flex flex-wrap items-center gap-4">
          <span className="ops-tile-icon !w-16 !h-16 shrink-0"><OpsIcon name="radio" size={40} /></span>
          <div>
            <h1 className="text-4xl font-light leading-tight">Admin Panel</h1>
            <p className="text-base opacity-90">{isAdmin ? 'Admin' : 'Director'}{dash && !dash.radioConnected && isAdmin ? ' · Radio not connected' : ''}</p>
          </div>
          <Link href="/" className="ops-btn ml-auto">Back to site</Link>
        </header>

        <Notifications items={alerts?.items ?? []} dismissedCount={alerts?.dismissedCount ?? 0} reload={load} />

        {/* Status */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="ops-card p-4 min-w-0">
            <p className="text-sm opacity-90">On air</p>
            <p className="text-lg truncate">{dash?.onAir.title || 'Nothing scheduled'}</p>
            <p className="text-sm opacity-80">{dash?.onAir.endAt ? `until ${clock(dash.onAir.endAt)}` : ''}</p>
          </div>
          <div className="ops-card p-4 min-w-0">
            <p className="text-sm opacity-90">{dash?.nowPlaying.isLive ? `Live · ${dash.nowPlaying.streamer}` : dash?.nowPlaying.playlist ? `Playlist · ${dash.nowPlaying.playlist}` : 'Playing'}</p>
            <p className="text-lg truncate">{dash?.nowPlaying.song || '–'}</p>
          </div>
          <div className="ops-card p-4 min-w-0">
            <p className="text-sm opacity-90">Listeners now</p>
            <p className="text-3xl tabular-nums">{dash?.nowPlaying.listeners ?? '–'}</p>
          </div>
          <div className="ops-card p-4 min-w-0">
            <p className="text-sm opacity-90">Last 24 hours</p>
            <p className="text-lg tabular-nums">{dash ? `${dash.last24h.sessions} sessions · ${dash.last24h.hours} h` : '–'}</p>
            {dash?.announcement && <p className="text-sm">Announcement live</p>}
          </div>
        </div>

        {isAdmin && (
          <section aria-label="Station controls" className="space-y-4">
            <h2 className="text-3xl font-light">Station controls</h2>
            <StationPanel onReady={stationReady} />
          </section>
        )}

        {/* Menu */}
        {groups.map(g => {
          const tiles = g.tiles.filter(t => !t.admin || isAdmin)
          return (
            <section key={g.title} aria-label={g.title} className="space-y-4">
              <h2 className="text-3xl font-light">{g.title}</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
                {tiles.map(t => (
                  <Link key={t.href} href={t.href} className="ops-tile group flex gap-4 p-2 -m-2 items-start">
                    <span className="ops-tile-icon relative shrink-0"><OpsIcon name={t.icon} size={52} />
                      {!!t.badge && <span className="absolute -top-2 -right-2 min-w-7 h-7 px-1.5 rounded-full bg-white text-[#0f5233] text-sm font-bold flex items-center justify-center">{t.badge}</span>}
                    </span>
                    <span className="min-w-0 pt-1">
                      <span className="block text-2xl font-light leading-tight">{t.title}</span>
                      <span className="block text-base leading-snug mt-1 opacity-95">{t.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}

        {/* Next 24 hours */}
        <section className="ops-card p-5">
          <h2 className="text-2xl font-light mb-2">Next 24 hours</h2>
          <ul className="text-base divide-y divide-white/25">
            {(dash?.next ?? []).map((n, i) => (
              <li key={i} className="py-2 flex gap-3">
                <span className="tabular-nums w-36 shrink-0 opacity-90">{clock(n.startAt)} – {clock(n.endAt)}</span>
                <span className="truncate">{n.title}</span>
                <span className="text-sm opacity-80 ml-auto shrink-0">{n.source === 'auto' ? 'auto' : 'show'}</span>
              </li>
            ))}
            {!dash && <li className="py-2">Loading…</li>}
            {dash && !dash.next.length && <li className="py-2">Nothing scheduled.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

interface Tile { href: string; icon: IconName; title: string; text: string; badge?: number; admin?: boolean }
