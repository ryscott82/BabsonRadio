'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import StationPanel from '@/components/admin/StationPanel'
import Telemetry from '@/components/admin/Telemetry'
import { plexMono } from '@/components/admin/opsFont'

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
  const needs = alerts && (alerts.deadAir?.active || monitorStale || alerts.pendingRequests > 0 || (alerts.newReports ?? 0) > 0 || alerts.cancellations.length > 0)
  const tile = 'sk-raised px-3 py-2.5 min-w-0'

  return (
    <div className={`ops ${plexMono.className} min-h-screen`}>
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-br-dk-border pb-3">
        <h1 className="text-br-dk-text text-base font-semibold">radio-ops</h1>
        <span className="text-br-gold text-xs">{isAdmin ? 'role=admin' : 'role=director'}</span>
        {dash && !dash.radioConnected && isAdmin && <span className="text-xs text-br-dk-sub ml-auto">Radio not connected</span>}
      </div>

      <Telemetry />

      {/* Status strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">On air</p>
          <p className="text-br-dk-text truncate">{dash?.onAir.title || 'Nothing scheduled'}</p>
          <p className="text-xs text-br-dk-muted">{dash?.onAir.title ? (dash.onAir.isShow ? 'show' : 'genre block') : ''}{dash?.onAir.endAt ? ` · until ${clock(dash.onAir.endAt)}` : ''}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">{dash?.nowPlaying.isLive ? `Live · ${dash.nowPlaying.streamer}` : dash?.nowPlaying.playlist ? `Playlist · ${dash.nowPlaying.playlist}` : 'Playing'}</p>
          <p className="text-br-dk-text truncate">{dash?.nowPlaying.song || '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">Listening now</p>
          <p className="text-2xl text-br-dk-text tabular-nums">{dash?.nowPlaying.listeners ?? '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">Last 24 hours</p>
          <p className="text-br-dk-text tabular-nums">{dash ? `${dash.last24h.sessions} sessions · ${dash.last24h.hours} h` : '–'}</p>
          {dash?.announcement && <p className="text-xs text-br-gold truncate">Message live</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <section className="sk-raised p-4">
            <h2 className="text-br-gold text-xs mb-3">attention</h2>
            {!needs && <p className="text-sm text-br-dk-sub">Nothing waiting.</p>}
            {alerts?.deadAir?.active && <p className="text-sm text-br-red">DEAD AIR since {clock(alerts.deadAir.since)}. {alerts.deadAir.detail}</p>}
            {monitorStale && !alerts?.deadAir?.active && <p className="text-sm text-br-dk-text">The dead-air monitor has not checked in{alerts?.deadAir?.monitorAgeSec != null ? ` for ${Math.round(alerts.deadAir.monitorAgeSec / 60)} min` : ' yet'}. Make sure it is running on the streaming PC.</p>}
            {alerts && alerts.pendingRequests > 0 && (
              <p className="text-sm text-br-dk-text"><Link href="/admin/slots" className="underline">{alerts.pendingRequests} show request{alerts.pendingRequests === 1 ? '' : 's'}</Link> waiting for a decision.</p>
            )}
            {alerts && (alerts.newReports ?? 0) > 0 && (
              <p className="text-sm text-br-dk-text"><Link href="/admin/feedback" className="underline">{alerts.newReports} new bug report{alerts.newReports === 1 ? '' : 's'} or idea{alerts.newReports === 1 ? '' : 's'}</Link>.</p>
            )}
            {alerts?.cancellations.map(c => (
              <p key={c.id} className="text-sm text-br-dk-text">
                Cancelled: {c.title} ({c.requesterName || 'student'}), {new Date(c.startAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {c.wasApproved ? ' · was approved' : ''}{c.reason ? ` · "${c.reason}"` : ''}
              </p>
            ))}
          </section>

          <section className="sk-raised p-4">
            <h2 className="text-br-gold text-xs mb-3">queue (24h)</h2>
            <ul className="text-sm divide-y divide-br-dk-border">
              {(dash?.next ?? []).map((n, i) => (
                <li key={i} className="py-1.5 flex gap-3">
                  <span className="text-br-dk-sub tabular-nums w-28 shrink-0">{clock(n.startAt)} – {clock(n.endAt)}</span>
                  <span className="text-br-dk-text truncate">{n.title}</span>
                  <span className="text-xs text-br-dk-muted ml-auto shrink-0">{n.source === 'auto' ? 'auto' : 'show'}</span>
                </li>
              ))}
              {dash && !dash.next.length && <li className="py-1.5 text-br-dk-sub">Nothing scheduled in the next 24 hours.</li>}
            </ul>
          </section>

          <section className="grid sm:grid-cols-3 gap-5 text-sm">
            <ToolGroup title="programming" links={[
              ['/admin/schedule', 'Schedule'], ['/admin/slots', 'Slot requests'], ['/admin/training', 'Training'], ['/admin/show-updates', 'Show updates'], ['/admin/library', 'Library content'],
              ...(isAdmin ? [['/admin/autoschedule', 'Auto-scheduler'], ['/admin/setlists', 'Set lists'], ['/admin/easter-eggs', 'Easter eggs']] : []),
            ]} />
            <ToolGroup title="people" links={[
              ['/admin/feedback', 'Bugs and ideas'], ['/admin/requests', 'Listener requests'],
              ...(isAdmin ? [['/admin/users', 'Users and roles'], ['/admin/testers', 'Beta testers'], ['/admin/birthdays', 'Birthdays'], ['/admin/notify', 'Send a notification']] : []),
            ]} />
            <ToolGroup title="numbers" links={[
              ['/admin/insights', 'What listeners like'],
              ...(isAdmin ? [['/admin/playlog', 'Play log (export)']] : []),
              ...(isAdmin ? [['/admin/listening', 'Listening log'], ['/admin/network', 'Friends web']] : []),
            ]} />
          </section>
        </div>

        {isAdmin && (
          <section className="lg:col-span-2 sk-raised p-4 h-fit">
            <h2 className="text-br-gold text-xs mb-3">station controls</h2>
            <StationPanel />
          </section>
        )}
      </div>
    </div>
    </div>
  )
}

function ToolGroup({ title, links }: { title: string; links: (string[])[] }) {
  return (
    <div>
      <h2 className="text-br-dk-sub text-xs mb-2">{title}</h2>
      <ul className="space-y-1">
        {links.map(([href, label]) => <li key={href}><Link href={href} className="text-br-dk-text hover:text-br-gold">{label}</Link></li>)}
      </ul>
    </div>
  )
}
