'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { SiteTextItem, SiteTextValues } from '@/lib/siteText'

export default function SiteTextPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<SiteTextItem[]>([])
  const [saved, setSaved] = useState<SiteTextValues>({})
  const [draft, setDraft] = useState<SiteTextValues>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<{ items: SiteTextItem[]; values: SiteTextValues }>('/api/admin/site-text')
      .then(r => { setItems(r.items); setSaved(r.values) }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  const pages = useMemo(() => [...new Set(items.map(i => i.page))], [items])
  const current = (i: SiteTextItem) => draft[i.key] ?? saved[i.key] ?? i.def

  async function save(i: SiteTextItem, value: string | null) {
    setBusy(i.key); setErr(''); setMsg('')
    try {
      const r = await api<{ values: SiteTextValues }>('/api/admin/site-text', { key: i.key, value })
      setSaved(r.values)
      setDraft(d => { const n = { ...d }; delete n[i.key]; return n })
      setMsg(value === null ? 'Back to the original words.' : 'Saved. The page updates within a minute.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy('')
  }

  if (loading || !isAdmin) return null
  return (
    <div className="px-5 lg:px-8 py-8 space-y-8">
      <h1 className="text-4xl font-light">Page text</h1>
      <p className="text-base opacity-90">Change the words on a page. Links go in like [this](/schedule). Reset puts the original words back.</p>
      {err && <p role="alert" className="text-base">{err}</p>}
      {msg && <p role="status" className="text-base">{msg}</p>}
      {pages.map(page => (
        <section key={page} className="space-y-4">
          <h2 className="text-3xl font-light">{page}</h2>
          {items.filter(i => i.page === page).map(i => {
            const dirty = draft[i.key] !== undefined && draft[i.key] !== (saved[i.key] ?? i.def)
            const changed = saved[i.key] !== undefined
            return (
              <div key={i.key} className="ops-card p-4 space-y-2">
                <label htmlFor={i.key} className="block text-lg">{i.label}</label>
                {i.hint && <p className="text-sm opacity-80">{i.hint}</p>}
                {i.lines
                  ? <textarea id={i.key} rows={Math.max(3, current(i).split('\n').length + 1)} value={current(i)} onChange={e => setDraft(d => ({ ...d, [i.key]: e.target.value }))}
                              className="w-full rounded-lg px-3 py-2 text-base bg-black/30 text-white" />
                  : <input id={i.key} value={current(i)} onChange={e => setDraft(d => ({ ...d, [i.key]: e.target.value }))} maxLength={300}
                           className="w-full rounded-lg px-3 py-2 text-base bg-black/30 text-white" />}
                <div className="flex gap-3">
                  <button type="button" disabled={!dirty || busy === i.key} onClick={() => save(i, current(i))} className="px-4 h-10 rounded-lg bg-white text-[#0f5233] disabled:opacity-40">Save</button>
                  <button type="button" disabled={!changed || busy === i.key} onClick={() => save(i, null)} className="px-4 h-10 rounded-lg border border-white/60 disabled:opacity-40">Reset</button>
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
