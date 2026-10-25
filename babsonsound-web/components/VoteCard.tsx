'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { RatingsBlock } from '@/components/LiveExtras'

interface State {
  blockStart: number; blockEnd: number; threshold: number
  options: { label: string; count: number }[]
  myVote: string | null; winner: string | null; upNext?: { blockStart: number; label: string } | null; canVote: boolean; requestsOpen?: boolean; requestsShow?: string
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "What would you like to hear": live votes for the next hour. Shown to signed-in people only. */
export default function VoteCard() {
  const { user, loading } = useAuth()
  const [s, setS] = useState<State | null>(null)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setS(await apiGet<State>('/api/vote')) } catch { /* keep the last tally */ }
  }, [])

  useEffect(() => {
    if (!user) return
    queueMicrotask(load)
    const t = setInterval(() => { if (!document.hidden) load() }, 30_000) // paused in background tabs; your own vote updates instantly
    return () => clearInterval(t)
  }, [user, load])

  if (loading || !user || !s) return null

  async function vote(genre: string) {
    setBusy(true); setMsg('')
    try { setS(await api<State>('/api/vote', { genre })) } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again.') }
    setBusy(false)
  }
  async function sendRequest(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    try { await api('/api/vote/request', { text }); setText(''); setMsg('Sent to the station. Thanks!') }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Try again.') }
    setBusy(false)
  }

  const top = Math.max(1, ...s.options.map(o => o.count))
  return (
    <section className="hw-panel hw-big space-y-4">
      <div>
        <h2 className="hw-title !whitespace-normal text-[1.9rem]">What would you like to hear?</h2>
        <div className="flex items-baseline justify-between gap-4 mt-1 text-sm">
          <span className="text-br-gold font-medium">{s.upNext?.label ? `${s.upNext.label} won ${clock(s.upNext.blockStart)}.` : ''}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {s.options.map(o => (
          <button key={o.label} disabled={busy || !s.canVote} onClick={() => vote(o.label)} aria-pressed={s.myVote === o.label}
                  className="sk-key hw-vote relative overflow-hidden text-left px-4 h-11 rounded-xl text-sm font-semibold">
            <span className="hw-vote-fill" style={{ width: `${Math.min(100, (o.count / top) * 100)}%` }} />
            <span className="relative flex justify-between gap-3">
              <span>{o.label}</span>
              <span className="tabular-nums font-medium">{o.count}</span>
            </span>
          </button>
        ))}
      </div>
      {!s.canVote && <p className="text-sm hw-sub">Voting opens once a Babson student sponsors you.</p>}
      {s.canVote && s.requestsOpen && (
        <form onSubmit={sendRequest} className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} maxLength={140} placeholder={`Request a song${s.requestsShow ? ` for ${s.requestsShow}` : ''}`}
                 className="sk-field flex-1 rounded-lg px-3 py-2 text-sm text-br-dk-text" />
          <button type="submit" disabled={busy || text.trim().length < 2} className="sk-btn font-display tracking-widest text-sm px-4 rounded-lg">Send</button>
        </form>
      )}
      {msg && <p className="text-sm hw-sub">{msg}</p>}
      <RatingsBlock />
    </section>
  )
}
