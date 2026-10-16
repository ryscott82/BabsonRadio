'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Item {
  id: string; type: 'bug' | 'feature'; message: string; name: string; email: string
  platform: 'web' | 'ios'; appVersion: string; page: string; status: 'new' | 'done'; createdAt: number
}

export default function AdminFeedbackPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [tab, setTab] = useState<'open' | 'archive'>('open')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setItems((await apiGet<{ items: Item[] }>('/api/admin/feedback')).items) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  if (!user || !isAdmin) return null
  const shown = items.filter(i => (tab === 'archive') === (i.status === 'done'))
  const openCount = items.filter(i => i.status === 'new').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">BUGS & IDEAS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <div className="flex gap-1 shrink-0">
          {([['open', `Open (${openCount})`], ['archive', 'Archive']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`font-display tracking-widest text-xs px-3 py-1.5 rounded-lg ${tab === k ? 'text-br-gold bg-br-dk-surface' : 'text-br-dk-sub'}`}>{l}</button>
          ))}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {shown.length === 0 && <p className="text-sm text-br-dk-sub">{tab === 'open' ? 'Nothing new.' : 'Nothing archived yet. Reports you mark done land here.'}</p>}
      {shown.map(i => (
        <div key={i.id} className={`sk-raised rounded-xl p-4 space-y-2 ${i.status === 'done' ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between gap-4">
            <span className={`font-display tracking-widest text-xs ${i.type === 'bug' ? 'text-br-red' : 'text-br-gold'}`}>
              {i.type === 'bug' ? 'BUG' : 'FEATURE IDEA'} · {i.platform.toUpperCase()}{i.appVersion ? ` ${i.appVersion}` : ''}
            </span>
            <span className="text-xs text-br-dk-sub">{new Date(i.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-sm text-br-dk-text whitespace-pre-wrap">{i.message}</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-br-dk-sub truncate">{i.name}{i.email ? ` · ${i.email}` : ''}{i.page ? ` · ${i.page}` : ''}</p>
            <button className="text-xs text-br-gold shrink-0"
                    onClick={async () => { await api('/api/admin/feedback', { id: i.id, status: i.status === 'new' ? 'done' : 'new' }).catch(() => {}); load() }}>
              {i.status === 'new' ? 'Done → archive' : 'Reopen'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
