'use client'

import Link from 'next/link'
import { badgeLine, needsTraining, standingView, type BadgeRow, type Standing, type StandingTone } from '@/lib/membersPage'

const TONE: Record<StandingTone, string> = { good: 'text-br-green', note: 'text-br-gold', warn: 'text-br-gold', ban: 'text-br-red' }

/** Two small tiles for the Studio access box: are you trained, and are you in good standing. Staff skip the training. */
export default function AccessStatus({ badges, staff, standing }: { badges: BadgeRow[]; staff: boolean; standing: Standing | null }) {
  const untrained = !staff && needsTraining(badges)
  const v = standing ? standingView(standing) : null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="sk-field rounded-xl p-3 space-y-1">
          <p className="text-sm text-br-dk-sub">Training</p>
          {staff
            ? <p className="text-base text-br-green font-semibold">Not needed</p>
            : <p className={`text-base font-semibold ${untrained ? 'text-br-gold' : 'text-br-green'}`}>{badges[0]?.expired ? 'Ended' : untrained ? 'Not yet' : 'Trained'}</p>}
          {!staff && badges[0] && !untrained && <p className="text-sm text-br-dk-sub">{badgeLine(badges[0]).replace('Training: ', '')}</p>}
        </div>
        <div className="sk-field rounded-xl p-3 space-y-1">
          <p className="text-sm text-br-dk-sub">Standing</p>
          <p className={`text-base font-semibold ${v ? TONE[v.tone] : 'text-br-dk-sub'}`}>{v ? v.headline : 'Loading…'}</p>
        </div>
      </div>
      {v && v.lines.length > 0 && <ul className="list-disc pl-6 text-sm text-br-dk-sub space-y-1">{v.lines.map(l => <li key={l}>{l}</li>)}</ul>}
      {untrained && (
        <div className="space-y-2">
          <p className="text-base text-br-dk-text">One training covers the studio, the radio and going live: a short video, a quiz and the agreement.</p>
          <Link href="/training" className="sk-key inline-flex items-center rounded-lg px-4 min-h-11 text-base font-semibold text-br-dk-text">{badges.some(b => b.expired) ? 'Retake the training' : 'Take the training'}</Link>
        </div>
      )}
    </div>
  )
}
