'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'

interface Alerts {
  pendingRequests: number; newReports: number | null
  cancellations: { id: string; title: string; requesterName: string; startAt: number; cancelledAt: number; reason: string; wasApproved: boolean }[]
}

export default function AdminPage() {
  const { user, isAdmin, isDirector, isHost, loading } = useAuth()
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alerts | null>(null)

  useEffect(() => {
    if (!loading && (!user || !(isHost || isDirector))) {
      router.replace('/')
    }
  }, [loading, user, isHost, isDirector, router])

  useEffect(() => {
    if (user && isDirector) apiGet<Alerts>('/api/admin/alerts').then(setAlerts).catch(() => {})
  }, [user, isDirector])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!user || !(isHost || isDirector)) return null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-10">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">ADMIN</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        {isAdmin ? (
          <span className="font-display text-br-gold text-xs tracking-widest">SUPER ADMIN</span>
        ) : isDirector && !isHost ? (
          <span className="font-display text-br-gold text-xs tracking-widest">DIRECTOR</span>
        ) : null}
      </div>

      {alerts && (alerts.pendingRequests > 0 || (alerts.newReports ?? 0) > 0 || alerts.cancellations.length > 0) && (
        <div className="sk-raised rounded-2xl p-5 mb-8 space-y-3">
          <h2 className="font-display text-br-gold tracking-widest text-sm">NEEDS ATTENTION</h2>
          {alerts.pendingRequests > 0 && (
            <p className="text-sm text-br-dk-text"><a href="/admin/slots" className="underline">{alerts.pendingRequests} show request{alerts.pendingRequests === 1 ? '' : 's'}</a> waiting for a decision.</p>
          )}
          {(alerts.newReports ?? 0) > 0 && (
            <p className="text-sm text-br-dk-text"><a href="/admin/feedback" className="underline">{alerts.newReports} new bug report{alerts.newReports === 1 ? '' : 's'} or idea{alerts.newReports === 1 ? '' : 's'}</a>.</p>
          )}
          {alerts.cancellations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-br-dk-sub">Cancelled in the last 2 weeks</p>
              {alerts.cancellations.map(c => (
                <p key={c.id} className="text-sm text-br-dk-text">
                  {c.title} ({c.requesterName || 'student'}), {new Date(c.startAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {c.wasApproved ? ' · was approved' : ''}{c.reason ? ` · "${c.reason}"` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AdminCard
          title="Upload Episode"
          description="Add a new episode to a show. Paste a YouTube ID or upload an audio file."
          icon="⬆"
          href="/admin/upload"
        />
        <AdminCard
          title="Manage Shows"
          description="Create or edit shows, update artwork, descriptions, and host assignments."
          icon="🎙"
          href="/admin/shows"
        />
        {isDirector && (
          <>
            <AdminCard
              title="Slot Requests"
              description="Review requests from students who want airtime. Approve, decline, and send live-stream details."
              icon="🎤"
              href="/admin/slots"
            />
            <AdminCard
              title="Schedule"
              description="Set recurring show time slots and manage the weekly schedule grid."
              icon="📅"
              href="/admin/schedule"
            />
          </>
        )}
        {isAdmin && (
          <>
            <AdminCard
              title="Auto-Scheduler"
              description="Fill empty airtime with lofi, jazz, acoustic and more. Edit the rules, preview the next 48 hours."
              icon="🤖"
              href="/admin/autoschedule"
            />
            <AdminCard
              title="Beta Testers"
              description="Who can sign up and get in before launch. Add Babson emails here."
              icon="🔑"
              href="/admin/testers"
            />
            <AdminCard
              title="Set Lists"
              description="Songs hosts reported playing on air. Download them as a spreadsheet."
              icon="🎵"
              href="/admin/setlists"
            />
            <AdminCard
              title="Show Updates"
              description="Changes hosts asked for on their shows. Approve to put them live."
              icon="✏️"
              href="/admin/show-updates"
            />
            <AdminCard
              title="Bugs & Ideas"
              description="Reports and feature ideas sent from the website and the app. Mark them done as you go."
              icon="🐞"
              href="/admin/feedback"
            />
            <AdminCard
              title="Users"
              description="View all users, manage roles, and review guest access invites."
              icon="👥"
              href="/admin/users"
            />
          </>
        )}
      </div>
    </div>
  )
}

function AdminCard({
  title, description, icon, href
}: {
  title: string; description: string; icon: string; href: string
}) {
  return (
    <a
      href={href}
      className="block p-6 rounded-2xl bg-br-dk-surface border border-br-dk-border hover:border-br-dk-border2 transition-colors group"
    >
      <div className="text-2xl mb-4">{icon}</div>
      <h3 className="font-display text-br-dk-text text-xl tracking-wide mb-2 group-hover:text-br-gold transition-colors">
        {title}
      </h3>
      <p className="text-br-dk-sub text-sm">{description}</p>
    </a>
  )
}
