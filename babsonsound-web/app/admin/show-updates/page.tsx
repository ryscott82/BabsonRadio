'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Side { showName: string; description: string; imageUrl: string }
interface Item { id: string; requesterName: string; createdAt: number; current: Side; requested: Side }

export default function AdminShowUpdatesPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setItems((await apiGet<{ items: Item[] }>('/api/admin/show-updates')).items) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load requests.') }
  }, [])
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function decide(id: string, action: 'approve' | 'decline') {
    setError('')
    try { await api('/api/admin/show-updates', { id, action }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (!user || !isAdmin) return null
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Show updates</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">Changes hosts asked for on their weekly shows. Approving puts them live on the schedule right away.</p>
      <ErrorText>{error}</ErrorText>
      {items.length === 0 && !error && <p className="text-sm text-br-dk-sub">Nothing waiting.</p>}
      {items.map(i => (
        <div key={i.id} className="sk-raised rounded-xl p-4 space-y-3">
          <p className="text-xs text-br-dk-sub">{i.requesterName || 'A host'} · {new Date(i.createdAt).toLocaleString()}</p>
          {(['showName', 'description'] as const).filter(k => i.requested[k]).map(k => (
            <div key={k} className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><p className="font-display text-[13px] tracking-widest text-br-dk-sub mb-1">{k === 'showName' ? 'Name now' : 'Description now'}</p>
                <p className="text-br-dk-sub whitespace-pre-wrap">{i.current[k] || '(empty)'}</p></div>
              <div><p className="font-display text-[13px] tracking-widest text-br-gold mb-1">Requested</p>
                <p className="text-br-dk-text whitespace-pre-wrap">{i.requested[k]}</p></div>
            </div>
          ))}
          {i.requested.imageUrl && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.requested.imageUrl} alt="Requested picture" className="w-20 h-20 rounded-lg object-cover" />
              <span className="text-xs text-br-dk-sub">New picture</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => decide(i.id, 'approve')} className="sk-btn font-display tracking-widest text-xs px-4 py-2 rounded-lg">Approve</button>
            <button onClick={() => decide(i.id, 'decline')} className="sk-key font-display tracking-widest text-xs px-4 py-2 rounded-lg text-br-dk-text">Decline</button>
          </div>
        </div>
      ))}
    </div>
  )
}
