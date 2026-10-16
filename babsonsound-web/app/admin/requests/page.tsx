'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface PItem { id: string; title: string; artist: string; playlist: string; names: string[]; count: number; at: number; done: boolean; show: string }
interface Item { id: string; name: string; text: string; at: number; done: boolean; show: string }

export default function AdminRequestsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [pl, setPl] = useState<PItem[]>([])
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems((await apiGet<{ requests: Item[] }>('/api/admin/requests')).requests)
      setPl((await apiGet<{ requests: PItem[] }>('/api/admin/playlist-requests')).requests)
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

  async function actPl(body: Record<string, unknown>) {
    setError('')
    try { await api('/api/admin/playlist-requests', body); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (!user || !isAdmin) return null
  const plShown = pl.filter(i => showDone || !i.done)
  const byList = [...new Set(plShown.map(i => i.playlist))].sort((a, b) => a.localeCompare(b))
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
        <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em]">ADD TO A PLAYLIST</h2>
        <p className="text-sm text-br-dk-sub">Songs listeners want added to a playlist, grouped by playlist. Requests made during a host&apos;s show also appear in that host&apos;s panel.</p>
        {byList.map(name => (
          <div key={name} className="space-y-2">
            <h3 className="text-xs text-br-gold tracking-widest">{name}</h3>
            {plShown.filter(i => i.playlist === name).map(i => (
              <div key={i.id} className="sk-raised rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm ${i.done ? 'text-br-dk-sub line-through' : 'text-br-dk-text'}`}>{i.title} <span className="text-br-dk-sub">· {i.artist}</span></p>
                  <p className="text-xs text-br-dk-muted">{i.count > 1 ? `${i.count} people` : i.names[0]}{i.show ? ` · during ${i.show}` : ' · auto DJ'} · {new Date(i.at).toLocaleString()}</p>
                </div>
                <span className="flex gap-3 shrink-0">
                  <button className="text-xs text-br-gold" onClick={() => actPl({ id: i.id, done: !i.done })}>{i.done ? 'Undo' : 'Added'}</button>
                  <button className="text-xs text-br-red" onClick={() => actPl({ id: i.id, remove: true })}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        ))}
        {!plShown.length && <p className="text-sm text-br-dk-sub">No playlist requests yet.</p>}
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
