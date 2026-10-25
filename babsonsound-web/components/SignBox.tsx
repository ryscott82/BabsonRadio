'use client'

import { useState } from 'react'
import { looksLikeFullName } from '@/lib/publicContent'

export interface Signature { typedName: string; accepted: true; version: string }

/** A signable agreement: every box ticked plus a typed full name. `onChange` gets the signature when complete, or null. */
export default function SignBox({ title, intro, clauses, version, onChange }: {
  title: string; intro?: string; clauses: string[]; version: string; onChange: (s: Signature | null) => void
}) {
  const [ticks, setTicks] = useState<boolean[]>(clauses.map(() => false))
  const [name, setName] = useState('')
  function update(t: boolean[], n: string) {
    setTicks(t); setName(n)
    onChange(t.every(Boolean) && looksLikeFullName(n) ? { typedName: n.trim(), accepted: true, version } : null)
  }
  return (
    <div className="sk-field rounded-xl p-4 space-y-3">
      <p className="font-display text-br-gold tracking-widest text-sm">{title}</p>
      {intro && <p className="text-sm text-br-dk-sub">{intro}</p>}
      <ul className="space-y-2">
        {clauses.map((c, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-sm text-br-dk-text">
              <input type="checkbox" className="mt-0.5" checked={ticks[i]} onChange={e => update(ticks.map((t, j) => (j === i ? e.target.checked : t)), name)} />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="block text-sm text-br-dk-sub mb-1.5 font-display tracking-widest">Sign by typing your full name</span>
        <input value={name} onChange={e => update(ticks, e.target.value)} maxLength={100} autoComplete="off" placeholder="First Last"
               className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text border border-br-dk-border" />
      </label>
    </div>
  )
}
