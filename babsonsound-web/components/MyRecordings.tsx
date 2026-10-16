'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'
import PublicAgreement, { type PublicSignature } from '@/components/PublicAgreement'
import type { AdultStatus } from '@/lib/publicContent'

interface Ep { id: string; title: string; showName: string; visibility: 'public' | 'private' }

// A host's own episodes. Everything is students-only; going public takes the signed agreement and an adult host.
export default function MyRecordings() {
  const [data, setData] = useState<{ status: AdultStatus; items: Ep[] } | null>(null)
  const [open, setOpen] = useState('')
  const [sig, setSig] = useState<PublicSignature | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(() => apiGet<{ status: AdultStatus; items: Ep[] }>('/api/episodes/mine').then(setData).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  if (!data || data.items.length === 0) return null

  async function set(ep: Ep, pub: boolean) {
    setBusy(true); setErr('')
    try { await api('/api/episodes/visibility', { episodeId: ep.id, public: pub, ...(pub ? sig : {}) }); setOpen(''); setSig(null); await load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <section className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-gold tracking-widest text-sm">MY RECORDINGS</h2>
      <p className="text-xs text-br-dk-sub">Recordings are for Babson students only unless you choose to share one publicly.</p>
      <ErrorText>{err}</ErrorText>
      <ul className="space-y-3">
        {data.items.map(ep => (
          <li key={ep.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-br-dk-text truncate">{ep.title}</p>
                <p className="text-xs text-br-dk-sub">{ep.showName} · {ep.visibility === 'public' ? 'Public' : 'Students only'}</p>
              </div>
              {ep.visibility === 'public'
                ? <button disabled={busy} onClick={() => set(ep, false)} className="text-xs text-br-gold">Make private</button>
                : <button onClick={() => { setOpen(open === ep.id ? '' : ep.id); setSig(null) }} className="text-xs text-br-dk-sub underline">Share publicly…</button>}
            </div>
            {open === ep.id && ep.visibility !== 'public' && (
              <div className="space-y-2">
                <PublicAgreement status={data.status} onChange={setSig} />
                {data.status === 'adult' && (
                  <button disabled={busy || !sig} onClick={() => set(ep, true)}
                          className="sk-key rounded-lg px-4 h-9 text-xs font-display tracking-widest text-br-gold disabled:opacity-40">SIGN AND MAKE PUBLIC</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
