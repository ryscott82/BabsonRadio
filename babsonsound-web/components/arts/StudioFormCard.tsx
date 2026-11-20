'use client'

import { useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'

interface Info { url: string; embed: boolean; fallbackSet: boolean; updatedAt: number | null }

/** The Microsoft Form people open after babsonradio.com/studioaccess. BabsonARTS staff and Admins can change the link. */
export default function StudioFormCard() {
  const [info, setInfo] = useState<Info | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { apiGet<Info>('/api/admin/studio-form').then(r => { setInfo(r); setText(r.url) }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load.')) }, [])

  async function save(body: { url?: string; embed?: boolean }) {
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<Info>('/api/admin/studio-form', body)
      setInfo(r); setText(r.url)
      setMsg(body.url === '' ? 'Cleared.' : 'Saved. The studio access page uses it within a minute.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  return (
    <section className="ops-card p-5 space-y-3" aria-label="Studio form link">
      <h2 className="text-2xl font-light">Studio form link</h2>
      <p className="text-base">The Microsoft Form people open after they enter their email at babsonradio.com/studioaccess.</p>
      {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
      {msg && <p role="status" className="text-base">{msg}</p>}
      <label htmlFor="arts-form-url" className="block text-base">Form link</label>
      <input id="arts-form-url" value={text} onChange={e => setText(e.target.value)} maxLength={500} inputMode="url" autoCapitalize="none" spellCheck={false}
             placeholder="https://forms.office.com/r/..." className="ops-field w-full min-h-11" />
      {info && !info.url && <p className="text-base">{info.fallbackSet ? 'No link saved here. The one set in Vercel is being used.' : 'No link yet. The page says the form is not available.'}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !text.trim() || text.trim() === info?.url} onClick={() => save({ url: text })} className="ops-btn px-5 min-h-11 disabled:opacity-50">Save</button>
        <button type="button" disabled={busy || !info?.url} onClick={() => save({ url: '' })} className="ops-btn px-5 min-h-11 disabled:opacity-50">Clear</button>
        {info?.url && <a href="/studioaccess" target="_blank" rel="noopener noreferrer" className="ops-btn px-5 min-h-11 inline-flex items-center">Open page</a>}
      </div>
      <label className="flex items-start gap-3 text-base pt-2">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={info?.embed === true} disabled={busy || !info} onChange={e => save({ embed: e.target.checked })} />
        <span>Show the form inside the page<span className="block text-sm">Turn this on once the form is set to Anyone can respond. Off, it opens in a new window.</span></span>
      </label>
    </section>
  )
}
