'use client'

import { standingView, type Standing } from '@/lib/membersPage'

const TONE = { good: 'text-br-green', note: 'text-br-gold', warn: 'text-br-gold', ban: 'text-br-red' } as const

/** Good standing, 1 mistake, Warning or a ban, with the dates and reasons, in plain words. */
export default function StandingCard({ standing }: { standing: Standing | null }) {
  if (!standing) return <p className="text-base text-br-dk-sub">Loading…</p>
  const v = standingView(standing)
  return (
    <div className="space-y-2">
      <p className={`text-xl font-semibold ${TONE[v.tone]}`}>{v.headline}</p>
      <p className="text-base text-br-dk-text">{v.detail}</p>
      {v.lines.length > 0 && <ul className="list-disc pl-6 text-base text-br-dk-sub space-y-1">{v.lines.map(l => <li key={l}>{l}</li>)}</ul>}
      <p className="text-base text-br-dk-sub">Mistakes end with the semester. The E-board can excuse one.</p>
    </div>
  )
}
