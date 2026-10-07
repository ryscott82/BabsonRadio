'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminPage() {
  const { user, isAdmin, isHost, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !isHost)) {
      router.replace('/')
    }
  }, [loading, user, isHost, router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!user || !isHost) return null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-10">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">ADMIN</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        {isAdmin && (
          <span className="font-display text-br-gold text-xs tracking-widest">SUPER ADMIN</span>
        )}
      </div>

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
        {isAdmin && (
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
