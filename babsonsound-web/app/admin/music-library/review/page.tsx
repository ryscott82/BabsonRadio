/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import StatusStrip from '@/components/admin/library/StatusStrip'
import { useLibraryState } from '@/components/admin/library/useLibrary'
import { changedFields, isLow, pct, type WorkerProposal } from '@/lib/libraryUi'

const STATUSES: [string, string][] = [['pending', 'Needs review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['applied', 'Applied'], ['failed', 'Failed']]
const GRID = 'lg:grid-cols-[28px_48px_minmax(0,1fr)_72px_132px_132px]'

function Cover({ url }: { url?: string }) {
  const [bad, setBad] = useState(false)
  // A fixed square so rows never change height when covers load or fail.
  return (
    <span className="block w-12 h-12 rounded bg-black/35 overflow-hidden shrink-0" aria-hidden>
      {url && !bad && <img src={url} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="w-12 h-12 object-cover" />}
    </span>
  )
}

// Admin only. The proposed changes: approve, reject or edit them, 50 to a page.
export default function ReviewPage() {
  const { isAdmin, loading } = useAuth()
  const { status, jobs, reload } = useLibraryState()
  const [state, setState] = useState('pending')
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const [rows, setRows] = useState<WorkerProposal[] | null>(null)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [next, setNext] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [edit, setEdit] = useState<{ id: string; title: string; artist: string; album: string; artUrl: string } | null>(null)
  const [minConf, setMinConf] = useState(90)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const at = cursors.length - 1
  const load = useCallback(async () => {
    setErr('')
    try {
      const u = new URLSearchParams({ status: state })
      if (q.trim()) u.set('q', q.trim())
      const after = cursors[at]
      if (after) u.set('after', after)
      const r = await apiGet<{ items: WorkerProposal[]; next: string | null }>(`/api/admin/library/proposals?${u}`)
      setRows(r.items); setNext(r.next)
    } catch (e) { setErr((e as Error).message); setRows([]) }
  }, [state, q, cursors, at])
  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(load, q ? 350 : 0)
    return () => clearTimeout(t)
  }, [isAdmin, load, q])

  const reset = () => { setCursors([undefined]); setSel(new Set()); setEdit(null); setConfirmAll(false); setRows(null) }
  if (loading || !isAdmin) return <div className="min-h-[60vh]" />

  const shown = (rows ?? []).filter(r => !low || isLow(r))
  const allOn = shown.length > 0 && shown.every(r => sel.has(r.songId))
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function act(kind: 'approve' | 'reject') {
    const ids = [...sel]
    if (!ids.length) return
    if (ids.length > 400) return setErr('Pick 400 or fewer at a time.')
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<{ changed: number; skipped?: number }>(`/api/admin/library/proposals/${kind}`, { ids })
      setMsg(`${kind === 'approve' ? 'Approved' : 'Rejected'} ${r.changed}${r.skipped ? `, skipped ${r.skipped}` : ''}.`)
      setSel(new Set()); await load(); reload()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function approveAll() {
    setBusy(true); setErr(''); setMsg('')
    try {
      let total = 0
      for (let i = 0; i < 10; i++) {
        const r = await api<{ changed: number; more: boolean }>('/api/admin/library/proposals/approve', { minConfidence: minConf / 100 })
        total += r.changed
        if (!r.more) break
      }
      setMsg(`Approved ${total} at ${minConf}% or above.`); setConfirmAll(false); setSel(new Set()); await load(); reload()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function saveEdit() {
    if (!edit) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const fields: Record<string, string> = { title: edit.title, artist: edit.artist, album: edit.album }
      if (edit.artUrl.trim()) fields.artUrl = edit.artUrl.trim()
      await api('/api/admin/library/proposals/edit', { id: edit.id, fields })
      setMsg('Saved. It is back in Needs review.'); setEdit(null); await load(); reload()
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const field = 'ops-field w-full', btn = 'ops-btn px-4 py-2 disabled:opacity-50'
  return (
    <div className="ops-hub">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header>
          <h1 className="text-4xl font-light leading-tight">Review queue</h1>
          <p className="text-base opacity-90 mt-1">Proposed changes from the studio PC. Nothing changes on the radio until you approve and apply.</p>
        </header>
        <StatusStrip status={status} jobs={jobs} />

        <div className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-center">
          <select className={field} value={state} onChange={e => { setState(e.target.value); reset() }} aria-label="Show">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="search" className={field} value={q} onChange={e => { setQ(e.target.value); setCursors([undefined]); setSel(new Set()) }} placeholder="Search by artist, or artist | title" aria-label="Search" />
          <label className="flex items-center gap-2 text-base whitespace-nowrap"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} /> Low confidence only</label>
        </div>

        <div className="ops-card p-3 flex flex-wrap items-center gap-3 min-h-[64px]">
          <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={allOn} onChange={e => setSel(e.target.checked ? new Set(shown.map(r => r.songId)) : new Set())} aria-label="Select all on this page" /> {sel.size} selected</label>
          <button type="button" className={btn} disabled={busy || !sel.size} onClick={() => act('approve')}>Approve</button>
          <button type="button" className={btn} disabled={busy || !sel.size} onClick={() => act('reject')}>Reject</button>
          <span className="sm:ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-base">Approve all above
              <input type="number" min={50} max={100} value={minConf} onChange={e => { setMinConf(Math.max(50, Math.min(100, Number(e.target.value) || 90))); setConfirmAll(false) }} className="ops-field w-20" aria-label="Confidence percent" />%
            </label>
            {confirmAll
              ? <button type="button" className="ops-btn-red px-4 py-2" disabled={busy} onClick={approveAll}>Approve all at {minConf}%+</button>
              : <button type="button" className={btn} disabled={busy} onClick={() => setConfirmAll(true)}>Approve all</button>}
          </span>
        </div>
        <div className="min-h-[3.5rem]" aria-live="polite">
          {err && <p role="alert" className="ops-card p-3">{err}</p>}
          {!err && msg && <p role="status" className="ops-card p-3">{msg}</p>}
        </div>

        <ul className="ops-card divide-y divide-white/25" aria-label="Proposals">
          {rows === null && Array.from({ length: 6 }, (_, i) => <li key={i} className="p-3 min-h-[88px]" aria-hidden />)}
          {rows && !shown.length && <li className="p-4 min-h-[88px]">{q || low ? 'Nothing matches.' : state === 'pending' ? 'Nothing to review. Run Fetch metadata on the Music library page.' : 'Nothing here.'}</li>}
          {shown.map(r => {
            const changes = changedFields(r)
            const editing = edit?.id === r.songId
            return (
              <li key={r.songId} className="p-3 space-y-3">
                <div className={`grid grid-cols-[28px_48px_minmax(0,1fr)] ${GRID} gap-x-3 gap-y-1 items-start min-h-[64px]`}>
                  <input type="checkbox" className="mt-1" checked={sel.has(r.songId)} onChange={() => toggle(r.songId)} aria-label={`Select ${r.proposed.title || r.current.title || 'song'}`} />
                  <Cover url={r.proposed.artUrl} />
                  <div className="min-w-0 space-y-0.5">
                    {changes.length ? changes.map(c => (
                      <p key={c.label} className="text-base break-words"><span className="opacity-70">{c.label}: </span>{c.from || 'empty'} <span aria-label="to">to</span> <strong className="font-medium">{c.to}</strong></p>
                    )) : <p className="text-base break-words">{r.current.title || r.proposed.title}{r.current.artist ? <span className="opacity-80"> by {r.current.artist}</span> : null}<span className="opacity-70"> (tags stay the same)</span></p>}
                    {r.error && <p className="text-sm">Error: {r.error}</p>}
                  </div>
                  <p className={`text-base tabular-nums col-start-3 lg:col-start-auto ${isLow(r) ? 'underline underline-offset-4' : ''}`} title="Confidence">{pct(r.proposed.confidence)}</p>
                  <p className="text-sm opacity-90 col-start-3 lg:col-start-auto">{r.beat ? `${Math.round(r.beat.bpm * 10) / 10} BPM` : 'No beat'}<br />{r.loudness ? `${r.loudness.lufs} LUFS, ${r.loudness.gainDb > 0 ? '+' : ''}${r.loudness.gainDb} dB` : 'No loudness'}</p>
                  <div className="col-start-3 lg:col-start-auto">
                    <button type="button" className="ops-btn px-3 py-1.5" aria-expanded={editing} onClick={() => setEdit(editing ? null : { id: r.songId, title: r.proposed.title ?? '', artist: r.proposed.artist ?? '', album: r.proposed.album ?? '', artUrl: r.proposed.artUrl ?? '' })}>{editing ? 'Close' : 'Edit'}</button>
                  </div>
                </div>
                {editing && edit && (
                  <div className="grid sm:grid-cols-2 gap-3 pl-1">
                    <label className="text-sm space-y-1 block">Title<input className={field} value={edit.title} maxLength={200} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
                    <label className="text-sm space-y-1 block">Artist<input className={field} value={edit.artist} maxLength={200} onChange={e => setEdit({ ...edit, artist: e.target.value })} /></label>
                    <label className="text-sm space-y-1 block">Album<input className={field} value={edit.album} maxLength={200} onChange={e => setEdit({ ...edit, album: e.target.value })} /></label>
                    <label className="text-sm space-y-1 block">Cover address (https)<input className={field} value={edit.artUrl} inputMode="url" onChange={e => setEdit({ ...edit, artUrl: e.target.value })} /></label>
                    <p className="text-sm opacity-80 sm:col-span-2">Saving puts it back in Needs review at 100% confidence. Approve it again to use it.</p>
                    <div className="sm:col-span-2"><button type="button" className={btn} disabled={busy} onClick={saveEdit}>Save</button></div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-3 min-h-[44px]">
          <button type="button" className={btn} disabled={at === 0 || busy} onClick={() => { setCursors(c => c.slice(0, -1)); setSel(new Set()); setEdit(null); setRows(null) }}>Newer</button>
          <span className="text-base tabular-nums">Page {at + 1}</span>
          <button type="button" className={btn} disabled={next === null || busy} onClick={() => { setCursors(c => [...c, next ?? undefined]); setSel(new Set()); setEdit(null); setRows(null) }}>Older</button>
          {low && <span className="text-sm opacity-80">Low confidence is under 70%, among the rows on this page.</span>}
        </div>
      </div>
    </div>
  )
}
