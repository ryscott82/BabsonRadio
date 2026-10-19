'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiDelete, apiGet } from '@/lib/auth'
import type { Ep } from '@/components/EpisodeRow'

export default function AdminLibrary() {
  const { user, isAdmin, isDirector, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Ep[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [url, setUrl] = useState(''); const [show, setShow] = useState(''); const [cat, setCat] = useState('Podcast'); const [title, setTitle] = useState(''); const [hosts, setHosts] = useState(''); const [pub, setPub] = useState(false)
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const ok = isAdmin || isDirector
  useEffect(() => { if (!loading && (!user || !ok)) router.replace('/') }, [loading, user, ok, router])
  const load = useCallback(() => apiGet<{ items: Ep[]; categories: string[] }>('/api/admin/episodes').then(r => { setItems(r.items); setCats(r.categories) }).catch(e => setErr(e.message)), [])
  useEffect(() => { if (user && ok) load() }, [user, ok, load])

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('')
    try { await api('/api/admin/episodes', { url, showName: show, category: cat, title, hostEmails: hosts, visibility: pub ? 'public' : 'private' }); setMsg('Added to the library.'); setUrl(''); setTitle(''); await load() }
    catch (e2) { setErr((e2 as Error).message) }
    setBusy(false)
  }
  async function remove(id: string) {
    if (!confirm('Remove this episode from the library?')) return
    try { await apiDelete('/api/admin/episodes', { id }); await load() } catch (e2) { setErr((e2 as Error).message) }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Library content</h1>
      <p className="text-sm text-br-dk-sub">Paste a YouTube link to add an episode. Students find it under Search and can save it to their Library. The video must allow embedding.</p>
      <form onSubmit={add} className="sk-raised rounded-2xl p-4 space-y-3">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube link" required className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full" />
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={show} onChange={e => setShow(e.target.value)} placeholder="Show name" required className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text" />
          <select value={cat} onChange={e => setCat(e.target.value)} className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text">{cats.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (leave blank to use the YouTube title)" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full" />
        <input value={hosts} onChange={e => setHosts(e.target.value)} placeholder="Host school email(s), comma separated (so ages can be checked)" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full" />
        <label className="flex items-start gap-2 text-xs text-br-dk-sub">
          <input type="checkbox" className="mt-0.5" checked={pub} onChange={e => setPub(e.target.checked)} />
          <span>Public (anyone, not only students). Only works if every host is 18+ and has signed the public-sharing agreement for this show. Otherwise it stays students-only.</span>
        </label>
        <button disabled={busy} className="sk-key rounded-lg px-4 h-9 text-xs font-display tracking-widest text-br-gold disabled:opacity-50">{busy ? 'ADDING…' : 'Add episode'}</button>
        {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
      <ul className="space-y-2">
        {items.map(e => (
          <li key={e.id} className="sk-raised rounded-xl p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1"><p className="text-sm text-br-dk-text truncate">{e.title}</p><p className="text-xs text-br-dk-sub">{e.showName} · {e.category} · {(e as { visibility?: string }).visibility === 'public' ? 'Public' : 'Students only'}</p></div>
            <button onClick={() => remove(e.id)} className="text-xs text-red-400">Remove</button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-br-dk-sub">No episodes yet.</li>}
      </ul>
    </div>
  )
}

