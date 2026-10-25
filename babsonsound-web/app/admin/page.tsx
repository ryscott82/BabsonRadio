'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import StationPanel from '@/components/admin/StationPanel'

interface Alerts {
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

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const load = useCallback(() => {
    apiGet<Alerts>('/api/admin/alerts').then(setAlerts).catch(() => {})
    apiGet<Dash>('/api/admin/dashboard').then(setDash).catch(() => {})
  }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    queueMicrotask(load)
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [user, isDirector, load])

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  const monitorStale = !!alerts?.deadAir && (alerts.deadAir.monitorAgeSec == null || alerts.deadAir.monitorAgeSec > 300)
  const deadAir = !!alerts?.deadAir?.active
  const pending = alerts?.pendingRequests ?? 0
  const reports = alerts?.newReports ?? 0
  const cancels = alerts?.cancellations ?? []
  const count = (deadAir ? 1 : 0) + (monitorStale && !deadAir ? 1 : 0) + (pending > 0 ? 1 : 0) + (reports > 0 ? 1 : 0) + cancels.length
  const tile = 'sk-raised px-3 py-2.5 min-w-0'
  const row = 'flex items-center gap-3 py-2 text-sm'
  const go = 'ml-auto shrink-0 sk-key px-3 py-1'

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-br-dk-border pb-3">
        <h1 className="text-br-dk-text text-base font-semibold">radio-ops</h1>
        <span className="text-br-gold text-sm">{isAdmin ? 'admin' : 'director'}</span>
        {dash && !dash.radioConnected && isAdmin && <span className="text-sm text-br-red ml-auto">Radio not connected</span>}
      </div>

      {/* Notifications */}
      <section className="sk-raised p-4" aria-label="Notifications">
        <h2 className="text-br-gold text-sm mb-1">Notifications{count > 0 ? ` (${count})` : ''}</h2>
        {count === 0 && <p className="text-sm text-br-dk-sub py-1">Nothing needs attention.</p>}
        <ul className="divide-y divide-br-dk-border">
          {deadAir && <li className={row}><span className="text-br-red">Dead air since {clock(alerts!.deadAir!.since)}. {alerts!.deadAir!.detail}</span></li>}
          {monitorStale && !deadAir && (
            <li className={row}><span>Dead-air monitor is silent{alerts?.deadAir?.monitorAgeSec != null ? ` (${Math.round(alerts.deadAir.monitorAgeSec / 60)} min)` : ''}. Check the streaming PC.</span></li>
          )}
          {pending > 0 && <li className={row}><span>{pending} show request{pending === 1 ? '' : 's'} to review</span><Link href="/admin/slots" className={go}>Review</Link></li>}
          {reports > 0 && <li className={row}><span>{reports} new bug report{reports === 1 ? '' : 's'} or idea{reports === 1 ? '' : 's'}</span><Link href="/admin/feedback" className={go}>Open</Link></li>}
          {cancels.map(c => (
            <li key={c.id} className={row}>
              <span>Cancelled: {c.title} ({c.requesterName || 'student'}), {new Date(c.startAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{c.wasApproved ? ', was approved' : ''}{c.reason ? `, "${c.reason}"` : ''}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={tile}>
          <p className="text-sm text-br-dk-sub">On air</p>
          <p className="text-br-dk-text truncate">{dash?.onAir.title || 'Nothing scheduled'}</p>
          <p className="text-sm text-br-dk-muted">{dash?.onAir.endAt ? `until ${clock(dash.onAir.endAt)}` : ''}</p>
        </div>
        <div className={tile}>
          <p className="text-sm text-br-dk-sub">{dash?.nowPlaying.isLive ? `Live · ${dash.nowPlaying.streamer}` : dash?.nowPlaying.playlist ? `Playlist · ${dash.nowPlaying.playlist}` : 'Playing'}</p>
          <p className="text-br-dk-text truncate">{dash?.nowPlaying.song || '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-sm text-br-dk-sub">Listeners now</p>
          <p className="text-2xl text-br-dk-text tabular-nums">{dash?.nowPlaying.listeners ?? '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-sm text-br-dk-sub">Last 24 hours</p>
          <p className="text-br-dk-text tabular-nums">{dash ? `${dash.last24h.sessions} sessions · ${dash.last24h.hours} h` : '–'}</p>
          {dash?.announcement && <p className="text-sm text-br-gold truncate">Announcement live</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <section className="grid sm:grid-cols-2 gap-5 text-sm sk-raised p-4">
            <ToolGroup title="Programming" links={[
              ['/admin/schedule', 'Schedule'], ['/admin/slots', 'Slot requests'], ['/admin/training', 'Training'], ['/admin/show-updates', 'Show updates'], ['/admin/library', 'Library'],
              ...(isAdmin ? [['/admin/autoschedule', 'Auto-scheduler'], ['/admin/setlists', 'Set lists'], ['/admin/easter-eggs', 'Easter eggs'], ['/admin/blocked-words', 'Blocked words']] : []),
            ]} />
            <ToolGroup title="People" links={[
              ['/admin/feedback', 'Bugs and ideas'], ['/admin/requests', 'Listener requests'],
              ...(isAdmin ? [['/admin/users', 'Users and roles'], ['/admin/launch-email', 'Launch email'], ['/admin/notify', 'Send notification'], ['/admin/birthdays', 'Birthdays'], ['/admin/phone-changes', 'Phone changes']] : []),
            ]} />
          </section>

          <section className="sk-raised p-4">
            <h2 className="text-br-gold text-sm mb-2">Next 24 hours</h2>
            <ul className="text-sm divide-y divide-br-dk-border">
              {(dash?.next ?? []).map((n, i) => (
                <li key={i} className="py-1.5 flex gap-3">
                  <span className="text-br-dk-sub tabular-nums w-32 shrink-0">{clock(n.startAt)} – {clock(n.endAt)}</span>
                  <span className="text-br-dk-text truncate">{n.title}</span>
                  <span className="text-sm text-br-dk-muted ml-auto shrink-0">{n.source === 'auto' ? 'auto' : 'show'}</span>
                </li>
              ))}
              {dash && !dash.next.length && <li className="py-1.5 text-br-dk-sub">Nothing scheduled.</li>}
            </ul>
          </section>

          <section className="flex gap-3 text-sm">
            <Link href="/admin/stats" className="sk-key px-4 py-2">Stats</Link>
            <Link href="/admin/tests" className="sk-key px-4 py-2">Tests</Link>
          </section>
        </div>

        {isAdmin && (
          <section className="lg:col-span-2 sk-raised p-4 h-fit">
            <h2 className="text-br-gold text-sm mb-3">Station controls</h2>
            <StationPanel />
          </section>
        )}
      </div>
    </div>
  )
}

function ToolGroup({ title, links }: { title: string; links: (string[])[] }) {
  return (
    <div>
      <h2 className="text-br-dk-sub text-sm mb-2">{title}</h2>
      <ul className="space-y-1.5">
        {links.map(([href, label]) => <li key={href}><Link href={href} className="text-br-dk-text hover:text-br-gold">{label}</Link></li>)}
      </ul>
    </div>
  )
}
