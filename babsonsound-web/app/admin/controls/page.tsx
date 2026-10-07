'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'

interface Show { occId: string; title: string; startAt: number; endAt: number; onAir: boolean; note: { headline: string; message: string } | null }
interface Data { configured: boolean; nowPlaying: { song: string; listeners: number; isLive: boolean; streamer: string } | null; shows: Show[] }

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export default function ControlsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [pick, setPick] = useState('')
  const [headline, setHeadline] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(() => { apiGet<Data>('/api/admin/controls').then(setD).catch(e => setErr(e.message)) }, [])
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) { load(); const t = setInterval(load, 15000); return () => clearInterval(t) } }, [user, isAdmin, load])

  async function act(action: 'skip' | 'emergency-stop' | 'resume', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(action); setErr(''); setMsg('')
    try { await api('/api/admin/controls', { action }); setMsg('Done.'); load() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed.') }
    setBusy('')
  }

  async function pin(clear: boolean) {
    const occId = pick || d?.shows.find(s => s.onAir)?.occId || d?.shows[0]?.occId
    if (!occId) return
    setBusy('note'); setErr(''); setMsg('')
    try {
      await api('/api/live/note', { occId, headline: clear ? '' : headline, message: clear ? '' : message })
      setMsg(clear ? 'Cleared.' : 'Live.'); if (clear) { setHeadline(''); setMessage('') }; load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed.') }
    setBusy('')
  }

  if (!isAdmin || !d) return <div className="max-w-3xl mx-auto px-4 py-8 text-br-dk-sub">{err || 'Loading…'}</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">STATION CONTROLS</h1>
      <ErrorText>{err}</ErrorText>
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
      {!d.configured && <p className="text-sm text-br-dk-sub">The radio is not connected yet. Set the AZURACAST_URL, AZURACAST_API_KEY and AZURACAST_STATION_ID environment variables.</p>}

      <section className="sk-raised rounded-2xl p-5 space-y-3">
        <p className="text-xs text-br-dk-sub">{d.nowPlaying?.isLive ? `LIVE · ${d.nowPlaying.streamer}` : 'NOW PLAYING'}{d.nowPlaying ? ` · ${d.nowPlaying.listeners} listening` : ''}</p>
        <p className="text-lg text-br-dk-text">{d.nowPlaying?.song || 'Nothing reported'}</p>
        <div className="flex flex-wrap gap-3">
          <PrimaryButton type="button" busy={busy === 'skip'} onClick={() => act('skip')}>SKIP SONG</PrimaryButton>
        </div>
      </section>

      <section className="sk-raised rounded-2xl p-5 space-y-3 border border-br-red/50">
        <h2 className="font-display text-br-red tracking-widest text-sm">EMERGENCY</h2>
        <p className="text-sm text-br-dk-sub">Stop takes the station off air right away. Resume brings it back.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={!!busy} onClick={() => act('emergency-stop', 'Take Babson Radio off air now?')}
                  className="rounded-xl bg-br-red text-white px-5 py-3 font-display tracking-widest text-sm disabled:opacity-50">EMERGENCY STOP</button>
          <button type="button" disabled={!!busy} onClick={() => act('resume', 'Bring the station back on air?')}
                  className="rounded-xl border border-br-dk-border text-br-dk-text px-5 py-3 font-display tracking-widest text-sm disabled:opacity-50">RESUME</button>
        </div>
      </section>

      <section className="sk-raised rounded-2xl p-5 space-y-3">
        <h2 className="font-display text-br-gold tracking-widest text-sm">PIN A MESSAGE ON ANY SHOW</h2>
        <select value={pick} onChange={e => { setPick(e.target.value); const s = d.shows.find(x => x.occId === e.target.value); setHeadline(s?.note?.headline ?? ''); setMessage(s?.note?.message ?? '') }}
                className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full">
          <option value="">{d.shows.find(s => s.onAir) ? 'On air now' : 'Choose a show'}</option>
          {d.shows.map(s => <option key={s.occId} value={s.occId}>{s.title} · {when(s.startAt)}{s.note ? ' · has message' : ''}</option>)}
        </select>
        <Field label="Headline" value={headline} onChange={e => setHeadline(e.target.value)} maxLength={80} />
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={400} aria-label="Details"
                  className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" />
        <div className="flex gap-3 items-center">
          <PrimaryButton type="button" busy={busy === 'note'} onClick={() => pin(false)}>SHOW TO LISTENERS</PrimaryButton>
          <button type="button" onClick={() => pin(true)} className="text-sm text-br-dk-sub">Clear</button>
        </div>
      </section>
    </div>
  )
}
