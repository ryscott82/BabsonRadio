'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Sub { id: string; kind: 'song' | 'playlist'; name: string; title: string; artist: string; url: string; note: string; at: number; done: boolean }
interface Item { id: string; name: string; text: string; at: number; done: boolean; show: string }

export default function AdminRequestsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems((await apiGet<{ requests: Item[] }>('/api/admin/requests')).requests)
      setSubs((await apiGet<{ submissions: Sub[] }>('/api/admin/submissions')).submissions)
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load requests.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function act(body: Record<string, unknown>) {
    setError('')
    try { await api('/api/admin/requests', body); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  async function actSub(body: Record<string, unknown>) {
    setError('')
    try { await api('/api/admin/submissions', body); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (!user || !isAdmin) return null
  const subsShown = subs.filter(i => showDone || !i.done)
  const shown = items.filter(i => showDone || !i.done)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">LISTENER REQUESTS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Artists and songs listeners sent while a DJ had requests turned on for their show. There are no requests for the auto DJ, and nothing plays automatically.
      </p>
      <label className="flex items-center gap-2 text-xs text-br-dk-sub">
        <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show ones marked done
      </label>
      <ErrorText>{error}</ErrorText>

      <div className="space-y-3">
        <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em]">SUGGESTIONS</h2>
        <p className="text-sm text-br-dk-sub">Songs and playlists listeners sent from the Suggest page.</p>
        {subsShown.map(i => (
          <div key={i.id} className="sk-raised rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm ${i.done ? 'text-br-dk-sub line-through' : 'text-br-dk-text'}`}>
                {i.kind === 'playlist' ? 'Playlist: ' : ''}{i.title}{i.artist ? <span className="text-br-dk-sub"> · {i.artist}</span> : null}
              </p>
              {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-xs text-br-gold break-all">{i.url}</a>}
              {i.note && <p className="text-xs text-br-dk-sub">{i.note}</p>}
              <p className="text-xs text-br-dk-muted">{i.name} · {new Date(i.at).toLocaleString()}</p>
            </div>
            <span className="flex gap-3 shrink-0">
              <button className="text-xs text-br-gold" onClick={() => actSub({ id: i.id, done: !i.done })}>{i.done ? 'Undo' : 'Done'}</button>
              <button className="text-xs text-br-red" onClick={() => actSub({ id: i.id, remove: true })}>Delete</button>
            </span>
          </div>
        ))}
        {!subsShown.length && <p className="text-sm text-br-dk-sub">Nothing yet.</p>}
      </div>

      <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em]">SONG REQUESTS</h2>
      <div className="space-y-2">
        {shown.map(i => (
          <div key={i.id} className="sk-raised rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm ${i.done ? 'text-br-dk-sub line-through' : 'text-br-dk-text'}`}>{i.text}</p>
              <p className="text-xs text-br-dk-muted">{i.name}{i.show ? ` · ${i.show}` : ''} · {new Date(i.at).toLocaleString()}</p>
            </div>
            <span className="flex gap-3 shrink-0">
              <button className="text-xs text-br-gold" onClick={() => act({ id: i.id, done: !i.done })}>{i.done ? 'Undo' : 'Done'}</button>
              <button className="text-xs text-br-red" onClick={() => act({ id: i.id, remove: true })}>Delete</button>
            </span>
          </div>
        ))}
        {!shown.length && <p className="text-sm text-br-dk-sub">No requests yet.</p>}
      </div>
    </div>
  )
}
