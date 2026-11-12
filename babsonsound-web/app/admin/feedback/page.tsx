'use client'

import FilterBar, { Pick, MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Item {
  id: string; type: 'bug' | 'feature' | 'report'; target: { kind: string; id: string; label: string } | null; message: string; name: string; email: string
  platform: 'web' | 'ios'; appVersion: string; page: string; status: 'new' | 'done'; createdAt: number
}

const textOf = (i: Item) => `${i.message} ${i.name} ${i.email} ${i.page} ${i.platform} ${i.type} ${i.target?.label ?? ''} ${i.target?.id ?? ''}`

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

  const [kind, setKind] = useState('')
  const [plat, setPlat] = useState('')
  const f = useFilter(items, textOf)
  const listAll = f.items.filter(i => (tab === 'archive') === (i.status === 'done') && (!kind || i.type === kind) && (!plat || i.platform === plat))
  const paged = usePaged(listAll)
  const shown = paged.items
  if (!user || !isAdmin) return null
  const openCount = items.filter(i => i.status === 'new').length

  return (
    <div className="px-5 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Bugs & ideas</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <div className="flex gap-1 shrink-0">
          {([['open', `Open (${openCount})`], ['archive', 'Archive']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`font-display tracking-widest text-xs px-3 py-1.5 rounded-lg ${tab === k ? 'text-br-gold bg-br-dk-surface' : 'text-br-dk-sub'}`}>{l}</button>
          ))}
        </div>
      </div>
      <FilterBar f={f} total={items.length} shown={listAll.length} placeholder="Search reports, names, emails">
        <Pick value={kind} onChange={setKind} label="Type" options={[['', 'All types'], ['bug', 'Bugs'], ['feature', 'Ideas'], ['report', 'Reports']]} />
        <Pick value={plat} onChange={setPlat} label="Platform" options={[['', 'Web + iOS'], ['web', 'Web'], ['ios', 'iOS']]} />
      </FilterBar>
      <ErrorText>{error}</ErrorText>
      {shown.length === 0 && <p className="text-sm text-br-dk-sub">{tab === 'open' ? 'Nothing new.' : 'Nothing archived.'}</p>}
      {shown.map(i => (
        <div key={i.id} className={`sk-raised rounded-xl p-4 space-y-2 ${i.status === 'done' ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between gap-4">
            <span className={`font-display tracking-widest text-xs ${i.type === 'feature' ? 'text-br-gold' : 'text-br-red'}`}>
              {i.type === 'bug' ? 'BUG' : i.type === 'report' ? (i.target?.kind === 'person' ? 'REPORT: PERSON' : 'REPORT: CONTENT') : 'FEATURE IDEA'} · {i.platform.toUpperCase()}{i.appVersion ? ` ${i.appVersion}` : ''}
            </span>
            <span className="text-xs text-br-dk-sub">{new Date(i.createdAt).toLocaleString()}</span>
          </div>
          {i.target && (i.target.label || i.target.id) && (
            <p className="text-xs text-br-dk-sub">About: {i.target.label || i.target.id}{i.target.label && i.target.id ? ` (${i.target.id})` : ''}</p>
          )}
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
      <MoreButton p={paged} />
    </div>
  )
}
