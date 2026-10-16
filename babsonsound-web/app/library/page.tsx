'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'
import LockedGate from '@/components/LockedGate'
import { EpisodeRow, PlayerDialog, type Ep } from '@/components/EpisodeRow'

interface Data { saved: Ep[]; savedIds: string[]; forYou: { basedOnInterests: boolean; items: Ep[] } }

function LibraryBody() {
  const { hasLibraryAccess } = useAuth()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState<Ep | null>(null)
  const load = useCallback(() => apiGet<Data>('/api/library').then(setD).catch(e => setErr(e.message)), [])
  useEffect(() => { if (hasLibraryAccess) load() }, [hasLibraryAccess, load])

  async function toggle(ep: Ep) {
    if (!d) return
    const was = d.savedIds.includes(ep.id)
    // Show the change right away; put it back if the server says no.
    setD({ ...d, savedIds: was ? d.savedIds.filter(i => i !== ep.id) : [ep.id, ...d.savedIds],
           saved: was ? d.saved.filter(e => e.id !== ep.id) : [ep, ...d.saved] })
    try { await api('/api/library', { episodeId: ep.id, saved: !was }) } catch (e) { setErr((e as Error).message); load() }
  }

  if (err && !d) return <p className="text-sm text-red-400">{err}</p>
  if (!d) return <p className="text-sm text-br-dk-sub">Loading…</p>
  const ids = new Set(d.savedIds)
  // Starring an episode moves it to Saved right away, so it leaves this list.
  const fresh = d.forYou.items.filter(e => !ids.has(e.id))
  return (
    <div className="space-y-10">
      {err && <p className="text-sm text-red-400">{err}</p>}
      <section className="space-y-3">
        <h2 className="font-display text-br-dk-text text-xl tracking-widest">SAVED</h2>
        {d.saved.length === 0
          ? <p className="text-sm text-br-dk-sub">Nothing saved yet. <Link href="/browse" className="text-br-gold">Find episodes</Link></p>
          : d.saved.map(e => <EpisodeRow key={e.id} ep={e} saved onSave={toggle} onPlay={setPlaying} />)}
      </section>
      {fresh.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-br-dk-text text-xl tracking-widest">{d.forYou.basedOnInterests ? 'BASED ON YOUR INTERESTS' : 'NEW EPISODES'}</h2>
          {fresh.map(e => <EpisodeRow key={e.id} ep={e} saved={ids.has(e.id)} onSave={toggle} onPlay={setPlaying} />)}
        </section>
      )}
      <PlayerDialog ep={playing} onClose={() => setPlaying(null)} />
    </div>
  )
}

export default function LibraryPage() {
  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 space-y-4 fit">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">LIBRARY</h1>
      <div className="fit-body"><LockedGate><LibraryBody /></LockedGate></div>
    </div>
  )
}
