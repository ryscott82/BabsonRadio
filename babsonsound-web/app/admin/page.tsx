'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import StationPanel from '@/components/admin/StationPanel'

interface Alerts {
  pendingRequests: number; newReports: number | null
  cancellations: { id: string; title: string; requesterName: string; startAt: number; cancelledAt: number; reason: string; wasApproved: boolean }[]
}
interface Dash {
  radioConnected: boolean
  nowPlaying: { configured: boolean; song: string; listeners: number; isLive: boolean; streamer: string }
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

  const needs = alerts && (alerts.pendingRequests > 0 || (alerts.newReports ?? 0) > 0 || alerts.cancellations.length > 0)
  const tile = 'sk-raised rounded-xl px-4 py-3 min-w-0'

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-br-dk-text text-2xl tracking-[0.1em]">RADIO OPERATIONS</h1>
        <span className="font-display text-br-gold text-xs tracking-widest">{isAdmin ? 'ADMIN' : 'DIRECTOR'}</span>
        {dash && !dash.radioConnected && isAdmin && <span className="text-xs text-br-dk-sub ml-auto">Radio not connected</span>}
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">On air</p>
          <p className="text-br-dk-text truncate">{dash?.onAir.title || 'Nothing scheduled'}</p>
          <p className="text-xs text-br-dk-muted">{dash?.onAir.title ? (dash.onAir.isShow ? 'Show' : 'Genre block') : ''}{dash?.onAir.endAt ? ` · until ${clock(dash.onAir.endAt)}` : ''}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">{dash?.nowPlaying.isLive ? `Live · ${dash.nowPlaying.streamer}` : 'Playing'}</p>
          <p className="text-br-dk-text truncate">{dash?.nowPlaying.song || '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">Listening now</p>
          <p className="font-display text-2xl text-br-dk-text tabular-nums">{dash?.nowPlaying.listeners ?? '–'}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-br-dk-sub">Last 24 hours</p>
          <p className="text-br-dk-text tabular-nums">{dash ? `${dash.last24h.sessions} sessions · ${dash.last24h.hours} h` : '–'}</p>
          {dash?.announcement && <p className="text-xs text-br-gold truncate">Message live</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <section className="sk-raised rounded-2xl p-4">
            <h2 className="font-display text-br-gold tracking-widest text-xs mb-3">NEEDS ATTENTION</h2>
            {!needs && <p className="text-sm text-br-dk-sub">Nothing waiting.</p>}
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

          <section className="sk-raised rounded-2xl p-4">
            <h2 className="font-display text-br-gold tracking-widest text-xs mb-3">NEXT UP</h2>
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
            <ToolGroup title="PROGRAMMING" links={[
              ['/admin/schedule', 'Schedule'], ['/admin/slots', 'Slot requests'], ['/admin/show-updates', 'Show updates'],
              ...(isAdmin ? [['/admin/autoschedule', 'Auto-scheduler'], ['/admin/setlists', 'Set lists']] : []),
            ]} />
            <ToolGroup title="PEOPLE" links={[
              ['/admin/feedback', 'Bugs and ideas'],
              ...(isAdmin ? [['/admin/users', 'Users and roles'], ['/admin/testers', 'Beta testers']] : []),
            ]} />
            <ToolGroup title="NUMBERS" links={[
              ['/admin/insights', 'What listeners like'],
              ...(isAdmin ? [['/admin/listening', 'Listening log']] : []),
            ]} />
          </section>
        </div>

        {isAdmin && (
          <section className="lg:col-span-2 sk-raised rounded-2xl p-4 h-fit">
            <h2 className="font-display text-br-gold tracking-widest text-xs mb-3">STATION CONTROLS</h2>
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
      <h2 className="font-display text-br-dk-sub tracking-widest text-xs mb-2">{title}</h2>
      <ul className="space-y-1">
        {links.map(([href, label]) => <li key={href}><Link href={href} className="text-br-dk-text hover:text-br-gold">{label}</Link></li>)}
      </ul>
    </div>
  )
}
