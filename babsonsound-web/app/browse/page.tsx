'use client'

import { useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { useAuth } from '@/contexts/AuthContext'
import LockedGate from '@/components/LockedGate'
import { EpisodeRow, PlayerDialog, type Ep } from '@/components/EpisodeRow'

function BrowseBody() {
  const { hasLibraryAccess } = useAuth()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Ep[] | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [cat, setCat] = useState('')
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState<Ep | null>(null)

  useEffect(() => {
    if (!hasLibraryAccess) return
    const t = setTimeout(() => {
      apiGet<{ items: Ep[]; savedIds: string[] }>(`/api/episodes?q=${encodeURIComponent(q)}`)
        .then(r => { setItems(r.items); setSaved(new Set(r.savedIds)); setErr('') }).catch(e => setErr(e.message))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [hasLibraryAccess, q])

  async function toggle(ep: Ep) {
    const was = saved.has(ep.id)
    setSaved(s => { const n = new Set(s); if (was) n.delete(ep.id); else n.add(ep.id); return n })
    try { await api('/api/library', { episodeId: ep.id, saved: !was }) }
    catch (e) { setErr((e as Error).message); setSaved(s => { const n = new Set(s); if (was) n.add(ep.id); else n.delete(ep.id); return n }) }
  }

  const cats = [...new Set((items ?? []).map(e => e.category).filter(Boolean))]
  const shown = (items ?? []).filter(e => !cat || e.category === cat)
  return (
    <div className="space-y-5">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search episodes, shows and topics" aria-label="Search"
             className="sk-field rounded-lg px-3 py-2.5 text-sm text-br-dk-text w-full" />
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {['', ...cats].map(c => (
            <button key={c || 'all'} onClick={() => setCat(c)} aria-pressed={cat === c}
                    className={`sk-key rounded-full px-3 h-8 text-xs ${cat === c ? 'text-br-gold' : 'text-br-dk-sub'}`}>{c || 'All'}</button>
          ))}
        </div>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      {!items && !err && <p className="text-sm text-br-dk-sub">Loading…</p>}
      {items && shown.length === 0 && <p className="text-sm text-br-dk-sub">{q ? 'Nothing matches that search.' : 'No episodes yet. They show up here as soon as the station adds them.'}</p>}
      <div className="space-y-3">{shown.map(e => <EpisodeRow key={e.id} ep={e} saved={saved.has(e.id)} onSave={toggle} onPlay={setPlaying} />)}</div>
      <PlayerDialog ep={playing} onClose={() => setPlaying(null)} />
    </div>
  )
}

export default function BrowsePage() {
  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-6 space-y-4 fit">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">SEARCH</h1>
      <div className="fit-body"><LockedGate><BrowseBody /></LockedGate></div>
    </div>
  )
}
