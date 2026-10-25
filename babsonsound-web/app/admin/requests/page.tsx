'use client'

import FilterBar, { MoreButton, useFilter, usePaged, matchAll } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Sub { id: string; kind: 'song' | 'playlist'; name: string; title: string; artist: string; url: string; note: string; at: number; done: boolean }
interface Item { id: string; name: string; text: string; at: number; done: boolean; show: string }

const subText = (i: Sub) => `${i.title} ${i.artist} ${i.name} ${i.note} ${i.url} ${i.kind}`
const reqText = (i: Item) => `${i.text} ${i.name} ${i.show}`

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

  const sf = useFilter([...subs, ...items] as (Sub | Item)[], x => ('title' in x ? subText(x) : reqText(x)))
  const sfq = sf.q
  const subsShown = subs.filter(i => (showDone || !i.done) && matchAll(subText(i), sfq))
  const shown = items.filter(i => (showDone || !i.done) && matchAll(reqText(i), sfq))
  const subsPaged = usePaged(subsShown)
  const reqPaged = usePaged(shown)
  if (!user || !isAdmin) return null

  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Listener requests</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
Songs listeners asked for during a show.
      </p>
      <FilterBar f={sf} total={subs.length + items.length} shown={subsShown.length + shown.length} placeholder="Search title, artist, name" />
      <label className="flex items-center gap-2 text-sm text-br-dk-sub">
        <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show ones marked done
      </label>
      <ErrorText>{error}</ErrorText>

      <div className="space-y-3">
        <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em]">Suggestions</h2>
        {subsPaged.items.map(i => (
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
        <MoreButton p={subsPaged} />
      </div>

      <h2 className="font-display text-br-dk-text text-xl tracking-[0.1em]">Song requests</h2>
      <div className="space-y-2">
        {reqPaged.items.map(i => (
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
        <MoreButton p={reqPaged} />
        {!shown.length && <p className="text-sm text-br-dk-sub">No requests yet.</p>}
      </div>
    </div>
  )
}
