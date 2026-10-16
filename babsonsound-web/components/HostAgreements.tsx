'use client'

import { useState } from 'react'
import { HOST_AGREEMENTS, AGREEMENTS_VERSION } from '@/lib/conduct'
import { looksLikeFullName } from '@/lib/publicContent'
import { ErrorText, PrimaryButton } from '@/components/AuthUI'

/** The four host agreements on one screen, signed once with a typed full name. */
export default function HostAgreements({ onSign, busy, error }: {
  onSign: (sig: { typedName: string; accepted: true; version: string }) => void; busy?: boolean; error?: string
}) {
  const [ticks, setTicks] = useState<Record<string, boolean[]>>(() => Object.fromEntries(HOST_AGREEMENTS.map(a => [a.id, a.clauses.map(() => false)])))
  const [name, setName] = useState('')
  const all = HOST_AGREEMENTS.every(a => ticks[a.id].every(Boolean))
  const ok = all && looksLikeFullName(name)
  const toggle = (id: string, i: number, v: boolean) => setTicks(t => ({ ...t, [id]: t[id].map((x, j) => (j === i ? v : x)) }))

  return (
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); if (ok) onSign({ typedName: name.trim(), accepted: true, version: AGREEMENTS_VERSION }) }}>
      {HOST_AGREEMENTS.map(a => (
        <fieldset key={a.id} className="sk-field rounded-xl p-4 space-y-3">
          <legend className="font-display text-br-gold tracking-widest text-xs px-1">{a.title}</legend>
          {a.intro && <p className="text-xs text-br-dk-sub">{a.intro}</p>}
          <ul className="space-y-2">
            {a.clauses.map((c, i) => (
              <li key={i}>
                <label className="flex items-start gap-2 text-xs text-br-dk-text">
                  <input type="checkbox" className="mt-0.5" checked={ticks[a.id][i]} onChange={e => toggle(a.id, i, e.target.checked)} />
                  <span>{c}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      <label className="block">
        <span className="block text-xs text-br-dk-sub mb-1.5 font-display tracking-widest">SIGN BY TYPING YOUR FULL NAME</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="off" placeholder="First Last"
               className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
      </label>
      <ErrorText>{error}</ErrorText>
      <PrimaryButton type="submit" busy={busy} disabled={!ok}>SIGN</PrimaryButton>
    </form>
  )
}
