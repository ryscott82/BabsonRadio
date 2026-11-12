'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'
import LockedGate from '@/components/LockedGate'
import { EpisodeRow, PlayerDialog, type Ep } from '@/components/EpisodeRow'

// The topics, each with its own metal tint (they used to be on the Search page).
const TOPICS: { name: string; tint: string }[] = [
  { name: 'Music', tint: '14,143,97' },
  { name: 'Interview', tint: '46,92,138' },
  { name: 'Podcast', tint: '122,62,140' },
  { name: 'Talk', tint: '212,118,44' },
  { name: 'News', tint: '200,48,42' },
]

interface Data { saved: Ep[]; savedIds: string[]; forYou: { basedOnInterests: boolean; items: Ep[] } }

function LibraryBody() {
  const { hasLibraryAccess } = useAuth()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState<Ep | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Ep[] | null>(null)
  const load = useCallback(() => apiGet<Data>('/api/library').then(setD).catch(e => setErr(e.message)), [])
  useEffect(() => { if (hasLibraryAccess) load() }, [hasLibraryAccess, load])

  // Search runs on the whole library of episodes, a moment after you stop typing.
  useEffect(() => {
    if (!hasLibraryAccess || !q.trim()) { queueMicrotask(() => setFound(null)); return }
    const t = setTimeout(() => {
      apiGet<{ items: Ep[] }>(`/api/episodes?q=${encodeURIComponent(q.trim())}`).then(r => setFound(r.items)).catch(e => setErr(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [hasLibraryAccess, q])

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
  const searchBox = (
    <div className="space-y-4">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search shows and episodes" aria-label="Search"
             className="sk-field rounded-lg px-3 py-2.5 text-sm text-br-dk-text w-full" />
      {!q && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="group" aria-label="Topics">
          {TOPICS.map(t => (
            <button key={t.name} type="button" onClick={() => setQ(t.name)}
                    style={{ '--hw-key-tint': `linear-gradient(rgba(${t.tint},.42), rgba(${t.tint},.42))` } as React.CSSProperties}
                    className="sk-key rounded-xl h-14 px-4 text-left text-base">{t.name}</button>
          ))}
        </div>
      )}
    </div>
  )
  if (q.trim()) {
    return (
      <div className="space-y-6">
        {searchBox}
        {err && <p className="text-sm text-red-400">{err}</p>}
        {!found && <p className="text-sm text-br-dk-sub">Searching…</p>}
        {found && found.length === 0 && <p className="text-sm text-br-dk-sub">Nothing matches that search.</p>}
        <div className="space-y-3">{(found ?? []).map(e => <EpisodeRow key={e.id} ep={e} saved={ids.has(e.id)} onSave={toggle} onPlay={setPlaying} />)}</div>
        <PlayerDialog ep={playing} onClose={() => setPlaying(null)} />
      </div>
    )
  }
  return (
    <div className="space-y-10">
      {searchBox}
      {err && <p className="text-sm text-red-400">{err}</p>}
      <section className="space-y-3">
        <h3 className="font-display text-br-dk-text text-xl tracking-widest">Saved</h3>
        {d.saved.length === 0
          ? <p className="text-sm text-br-dk-sub">Nothing saved yet. Search above to find episodes.</p>
          : d.saved.map(e => <EpisodeRow key={e.id} ep={e} saved onSave={toggle} onPlay={setPlaying} />)}
      </section>
      {fresh.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-br-dk-text text-xl tracking-widest">{d.forYou.basedOnInterests ? 'Based on your interests' : 'New episodes'}</h3>
          {fresh.map(e => <EpisodeRow key={e.id} ep={e} saved={ids.has(e.id)} onSave={toggle} onPlay={setPlaying} />)}
        </section>
      )}
      <PlayerDialog ep={playing} onClose={() => setPlaying(null)} />
    </div>
  )
}

/** The Episodes section of the Library: students only (the Shows section above it is public). */
export default function LibraryEpisodes() {
  return <LockedGate><LibraryBody /></LockedGate>
}
