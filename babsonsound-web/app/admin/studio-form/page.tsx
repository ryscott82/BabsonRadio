'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'

interface Info { url: string; fallbackSet: boolean; updatedAt: number | null }

export default function StudioFormPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [info, setInfo] = useState<Info | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<Info>('/api/admin/studio-form').then(r => { setInfo(r); setText(r.url) }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  async function save(value: string) {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<Info>('/api/admin/studio-form', { url: value })
      setInfo(r); setText(r.url)
      setMsg(value ? 'Saved. /studioaccess uses it within a minute.' : 'Cleared.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  if (loading || !isAdmin) return null
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-4xl font-light">Studio form</h1>
      <p className="text-base opacity-90">The Microsoft Form people see after they enter their email at babsonradio.com/studioaccess. Paste the form&apos;s link. It needs to be shared as Anyone can respond.</p>
      {err && <p role="alert" className="text-base">{err}</p>}
      {msg && <p role="status" className="text-base">{msg}</p>}
      <div className="ops-card p-4 space-y-3">
        <label htmlFor="studio-form-url" className="block text-lg">Form link</label>
        <input id="studio-form-url" value={text} onChange={e => setText(e.target.value)} maxLength={500} inputMode="url" autoCapitalize="none" spellCheck={false}
               placeholder="https://forms.office.com/r/..." className="w-full rounded-lg px-3 py-2 text-base bg-black/30 text-white" />
        {info && !info.url && <p className="text-sm opacity-80">{info.fallbackSet ? 'No link saved here. The one set in Vercel is being used.' : 'No link yet. The page says the form is not available.'}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={busy || !text.trim() || text.trim() === info?.url} onClick={() => save(text)} className="px-4 h-10 rounded-lg bg-white text-[#0f5233] disabled:opacity-40">Save</button>
          <button type="button" disabled={busy || !info?.url} onClick={() => save('')} className="px-4 h-10 rounded-lg border border-white/60 disabled:opacity-40">Clear</button>
          {info?.url && <a href="/studioaccess" target="_blank" rel="noopener noreferrer" className="px-4 h-10 inline-flex items-center rounded-lg border border-white/60">Open page</a>}
        </div>
      </div>
    </div>
  )
}
