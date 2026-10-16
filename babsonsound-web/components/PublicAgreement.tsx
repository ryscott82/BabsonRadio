'use client'

import { useState } from 'react'
import { NOT_ADULT_MESSAGE, PUBLIC_AGREEMENT_VERSION, PUBLIC_CLAUSES, looksLikeFullName, type AdultStatus } from '@/lib/publicContent'

export interface PublicSignature { typedName: string; accepted: true; version: string }

/**
 * The public-sharing agreement. Nothing is public unless every box is ticked and a full name is typed.
 * `onChange` gets the signature when it is complete, or null. Under-18s and people without an age on file only see a message.
 */
export default function PublicAgreement({ status, onChange }: { status: AdultStatus; onChange: (s: PublicSignature | null) => void }) {
  const [ticks, setTicks] = useState<boolean[]>(PUBLIC_CLAUSES.map(() => false))
  const [name, setName] = useState('')
  if (status !== 'adult') return <p className="text-xs text-br-dk-sub">{NOT_ADULT_MESSAGE[status]}</p>

  function update(nextTicks: boolean[], nextName: string) {
    setTicks(nextTicks); setName(nextName)
    onChange(nextTicks.every(Boolean) && looksLikeFullName(nextName) ? { typedName: nextName.trim(), accepted: true, version: PUBLIC_AGREEMENT_VERSION } : null)
  }

  return (
    <div className="sk-field rounded-xl p-4 space-y-3">
      <p className="text-xs text-br-dk-sub">Most Babson Radio content is for Babson students only. Sharing publicly is optional, and your content stays private unless you sign below.</p>
      <ul className="space-y-2">
        {PUBLIC_CLAUSES.map((c, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-xs text-br-dk-text">
              <input type="checkbox" className="mt-0.5" checked={ticks[i]} onChange={e => update(ticks.map((t, j) => (j === i ? e.target.checked : t)), name)} />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">SIGN BY TYPING YOUR FULL NAME</span>
        <input value={name} onChange={e => update(ticks, e.target.value)} maxLength={100} autoComplete="off" placeholder="First Last"
               className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text border border-br-dk-border" />
      </label>
    </div>
  )
}
