'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'

interface State {
  blockStart: number; blockEnd: number; threshold: number
  options: { label: string; count: number }[]
  myVote: string | null; winner: string | null; canVote: boolean; requestsOpen?: boolean; requestsShow?: string
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
    const t = setInterval(load, 10_000) // near real time
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

  const top = Math.max(1, s.threshold, ...s.options.map(o => o.count))
  return (
    <section className="sk-raised rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-display text-br-dk-text text-2xl tracking-wide">WHAT WOULD YOU LIKE TO HEAR?</h2>
        <p className="text-sm text-br-dk-sub mt-1">
          {s.winner
            ? `${s.winner} is taking over ${clock(s.blockStart)} – ${clock(s.blockEnd)}.`
            : `Vote for ${clock(s.blockStart)} – ${clock(s.blockEnd)}. At ${s.threshold} votes, a genre takes over the hour.`}
        </p>
      </div>
      <div className="space-y-2">
        {s.options.map(o => (
          <button key={o.label} disabled={busy || !s.canVote} onClick={() => vote(o.label)}
                  className={`relative w-full text-left rounded-lg overflow-hidden sk-field px-3 py-2 text-sm text-br-dk-text ${s.myVote === o.label ? 'ring-1 ring-br-gold' : ''}`}>
            <span className="absolute inset-y-0 left-0 bg-br-gold/20" style={{ width: `${Math.min(100, (o.count / top) * 100)}%` }} />
            <span className="relative flex justify-between gap-3">
              <span>{o.label}{s.winner === o.label ? ' ✓' : ''}</span>
              <span className="tabular-nums text-br-dk-sub">{o.count}</span>
            </span>
          </button>
        ))}
      </div>
      {!s.canVote && <p className="text-xs text-br-dk-sub">Voting opens once a Babson student sponsors you or has you in their contacts.</p>}
      {s.canVote && s.requestsOpen && (
        <form onSubmit={sendRequest} className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} maxLength={140} placeholder={`Request a song${s.requestsShow ? ` for ${s.requestsShow}` : ''}`}
                 className="sk-field flex-1 rounded-lg px-3 py-2 text-sm text-br-dk-text" />
          <button type="submit" disabled={busy || text.trim().length < 2} className="sk-btn font-display tracking-widest text-xs px-4 rounded-lg">SEND</button>
        </form>
      )}
      {msg && <p className="text-xs text-br-dk-sub">{msg}</p>}
    </section>
  )
}
