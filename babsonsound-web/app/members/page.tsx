'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import StudioBooking, { type Mine as StudioMine } from '@/components/StudioBooking'
import AccessStatus from '@/components/members/AccessStatus'
import ResourcesCard from '@/components/members/ResourcesCard'
import ClubEvents from '@/components/members/ClubEvents'
import InfoCard from '@/components/members/InfoCard'
import { badgeRows, bannedNotice, fmtWhen, nextUp, sectionsFor, signInPrompt, viewerOf, type SectionId, type Standing } from '@/lib/membersPage'

interface MeTraining { studioExpiresAt?: number | null; radioExpiresAt?: number | null; studioExpired?: boolean; radioExpired?: boolean }
interface MineShow { title: string; startAt: number; status: string }

/** One quadrant of the dashboard. On a wide screen it holds its height and scrolls inside; on a phone the four stack into one scrolling page. */
function Quadrant({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="sk-raised rounded-2xl p-5 space-y-4 scroll-mt-24 lg:max-h-[36rem] lg:overflow-y-auto">
      <h2 id={`h-${id}`} className="font-display text-br-dk-text text-xl tracking-widest">{title}</h2>
      {children}
    </section>
  )
}

/** Members: everything a member does in one place. Everyone can read events and info; the rest is for signed-in students (hidden for everyone else). */
export default function MembersPage() {
  const { user, isBabson, isGuest, isDirector, studioTrained, radioTrained, loading } = useAuth()
  const viewer = viewerOf({ signedIn: !!user, isGuest, isBabson })
  const [now] = useState(() => Date.now())
  const [standing, setStanding] = useState<Standing | null>(null)
  const [training, setTraining] = useState<MeTraining | null>(null)
  const [shows, setShows] = useState<MineShow[]>([])
  const [studioMine, setStudioMine] = useState<StudioMine | null>(null)
  const student = viewer === 'student'

  useEffect(() => {
    if (!student) return
    apiGet<Standing>('/api/me/standing').then(setStanding).catch(() => {})
    apiGet<{ training?: MeTraining }>('/api/me').then(m => setTraining(m.training ?? null)).catch(() => {})
    apiGet<{ requests: MineShow[] }>('/api/slots/mine').then(r => setShows(r.requests)).catch(() => {})
  }, [student])

  const onMine = useCallback((m: StudioMine) => setStudioMine(m), [])
  if (loading) return null

  const badges = badgeRows(training, { studio: studioTrained, radio: radioTrained })
  const items = nextUp({ now, bookings: studioMine?.upcoming ?? [], shows, badges: isDirector ? [] : badges })
  const show = new Set(sectionsFor(viewer))
  const prompt = signInPrompt(viewer)
  const banned = bannedNotice(standing)

  const myShows = shows.filter(x => x.startAt > now && (x.status === 'approved' || x.status === 'pending')).sort((a, b) => a.startAt - b.startAt).slice(0, 4)
  const dueTraining = items.find(i => i.kind === 'training')

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Members</h1>

      {prompt && (
        <div className="sk-raised rounded-2xl p-5 space-y-3">
          <p className="text-lg text-br-dk-text">{prompt}</p>
          {viewer === 'signed-out' && <Link href="/auth" className="sk-key hw-pill inline-flex items-center justify-center h-11 px-5 rounded-full text-base font-semibold">Sign in</Link>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {show.has('access') && (
          <Quadrant id="access" title="Studio access">
            <AccessStatus badges={badges} staff={isDirector} standing={standing} />
            {dueTraining && !isDirector && badges.every(b => b.has && !b.expired) && <p className="text-base text-br-gold">{dueTraining.text}</p>}
            <div className="space-y-3 border-t border-br-dk-border pt-4">
              <h3 className="font-display text-br-dk-text text-lg tracking-widest">Book the studio</h3>
              <StudioBooking standing={standing} onMine={onMine} />
            </div>
            <div className="space-y-3 border-t border-br-dk-border pt-4">
              <h3 className="font-display text-br-dk-text text-lg tracking-widest">Studio events</h3>
              <ClubEvents />
            </div>
          </Quadrant>
        )}

        {show.has('host') && (
          <Quadrant id="host" title="Host a show">
            {banned
              ? <p className="text-base text-br-dk-text">{banned}</p>
              : <>
                  <p className="text-base text-br-dk-sub">Pick a time, tell us about it, send. Approved automatically after 24 hours once you are trained.</p>
                  <Link href="/slots" style={{ '--hw-key-tint': 'linear-gradient(rgba(14,143,97,.38), rgba(14,143,97,.38))' } as React.CSSProperties}
                        className="sk-key hw-pill inline-flex items-center justify-center h-11 px-5 rounded-full text-base font-semibold">Host a show</Link>
                  <div className="space-y-2 border-t border-br-dk-border pt-4">
                    <h3 className="font-display text-br-dk-text text-lg tracking-widest">My upcoming shows</h3>
                    {myShows.length === 0
                      ? <p className="text-base text-br-dk-sub">No shows yet.</p>
                      : <ul className="space-y-2">{myShows.map(x => (
                          <li key={`${x.startAt}-${x.title}`}><Link href="/slots#mine" className="block sk-field rounded-xl px-4 py-3 text-base text-br-dk-text min-h-11">{x.title}, {fmtWhen(x.startAt)}{x.status === 'pending' ? ' (pending)' : ''}</Link></li>
                        ))}</ul>}
                    <p className="text-base text-br-dk-sub"><Link href="/slots#mine" className="text-br-gold underline underline-offset-4">My shows</Link> shows what happens next and lets you repeat a show.</p>
                  </div>
                </>}
          </Quadrant>
        )}

        {show.has('resources') && <Quadrant id="resources" title="Resources"><ResourcesCard trained={studioTrained || radioTrained} /></Quadrant>}
        {show.has('events') && <Quadrant id="events" title="Studio events"><ClubEvents /></Quadrant>}
        {show.has('info') && <Quadrant id="info" title="Info"><InfoCard /></Quadrant>}
      </div>
    </div>
  )
}
