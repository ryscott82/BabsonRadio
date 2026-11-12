'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import HostShowCard from '@/components/HostShowCard'
import StudioBooking, { type Mine as StudioMine } from '@/components/StudioBooking'
import TrainingCard from '@/components/members/TrainingCard'
import ClubEvents from '@/components/members/ClubEvents'
import InfoCard from '@/components/members/InfoCard'
import StandingCard from '@/components/members/StandingCard'
import { badgeRows, bannedNotice, nextUp, sectionsFor, signInPrompt, viewerOf, type SectionId, type Standing } from '@/lib/membersPage'

interface MeTraining { studioExpiresAt?: number | null; radioExpiresAt?: number | null; studioExpired?: boolean; radioExpired?: boolean }
interface MineShow { title: string; startAt: number; status: string }

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`h-${id}`} className="sk-raised rounded-2xl p-5 space-y-4 scroll-mt-24">
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

  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Members</h1>

      {prompt && (
        <div className="sk-raised rounded-2xl p-5 space-y-3">
          <p className="text-lg text-br-dk-text">{prompt}</p>
          {viewer === 'signed-out' && <Link href="/auth" className="sk-key hw-pill inline-flex items-center justify-center h-11 px-5 rounded-full text-base font-semibold">Sign in</Link>}
        </div>
      )}

      {show.has('next') && (
        <Section id="next" title="Next up for me">
          {items.length === 0
            ? <p className="text-base text-br-dk-sub">Nothing coming up. Book the studio or host a show below.</p>
            : <ul className="space-y-2">{items.map(i => (
                <li key={i.kind}><a href={i.href} className="block sk-field rounded-xl px-4 py-3 text-base text-br-dk-text min-h-11">{i.text}</a></li>
              ))}</ul>}
        </Section>
      )}

      {show.has('host') && (
        banned
          ? <Section id="host" title="Host a show"><p className="text-base text-br-dk-text">{banned}</p></Section>
          : <div id="host" className="scroll-mt-24 space-y-2">
              <HostShowCard note="Pick a time, tell us about it, send. Approved automatically after 24 hours when nothing needs a person." />
              <p className="text-base text-br-dk-sub px-1"><Link href="/slots#mine" className="text-br-gold underline underline-offset-4">My shows</Link> shows what happens next and lets you repeat a show.</p>
            </div>
      )}

      {show.has('studio') && <Section id="studio" title="Studio"><StudioBooking standing={standing} onMine={onMine} /></Section>}
      {show.has('standing') && <Section id="standing" title="Standing"><StandingCard standing={standing} /></Section>}
      {show.has('training') && <Section id="training" title="Training"><TrainingCard badges={badges} staff={isDirector} /></Section>}
      {show.has('events') && <Section id="events" title="Club events"><ClubEvents /></Section>}
      {show.has('info') && <Section id="info" title="Info"><InfoCard /></Section>}
    </div>
  )
}
