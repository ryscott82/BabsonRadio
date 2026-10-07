'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { NowPlaying } from '@/lib/nowplaying'

// Things around the live player: a pinned note from the host, quick reactions, the host's set list with upvotes,
// and star ratings for the show. Everyone can see them; students (and developers) can take part.

const EMOJIS = ['🔥', '❤️', '🎉', '👏']
const poll = (fn: () => void, ms: number) => {
  fn()
  const t = setInterval(() => { if (!document.hidden) fn() }, ms)
  return () => clearInterval(t)
}

interface Song { id: string; text: string; votes: number; mine: boolean }

export default function LiveExtras({ np }: { np: NowPlaying | null }) {
  const { hasMemberAccess, user } = useAuth()
  const can = !!user && hasMemberAccess
  const occId = np?.occId ?? ''

  // ── reactions ──
  const [recent, setRecent] = useState<Record<string, number>>({})
  const [mineSent, setMineSent] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!occId) return
    return poll(() => {
      apiGet<{ occId: string; recent: Record<string, number> }>('/api/live/reactions')
        .then(r => { if (r.occId === occId) { setRecent(r.recent); setMineSent({}) } }).catch(() => {})
    }, 6_000)
  }, [occId])
  async function react(e: string) {
    if (!can) { setMsg('Sign in with your school email to react.'); return }
    setMsg(''); setMineSent(m => ({ ...m, [e]: (m[e] ?? 0) + 1 }))
    try { await api('/api/live/reactions', { emoji: e }) }
    catch (err) { setMineSent(m => ({ ...m, [e]: Math.max(0, (m[e] ?? 1) - 1) })); setMsg(err instanceof Error ? err.message : 'Could not send.') }
  }

  // ── set list ──
  const [songs, setSongs] = useState<Song[]>([])
  const [listTitle, setListTitle] = useState('')
  const loadSongs = useCallback(() =>
    apiGet<{ title: string; songs: Song[] }>('/api/live/setlist').then(r => { setSongs(r.songs); setListTitle(r.title) }).catch(() => {}), [])
  useEffect(() => poll(() => { void loadSongs() }, 20_000), [loadSongs, occId, user?.uid])
  async function vote(id: string) {
    if (!can) { setMsg('Sign in with your school email to upvote.'); return }
    setSongs(s => s.map(x => x.id === id ? { ...x, mine: !x.mine, votes: x.votes + (x.mine ? -1 : 1) } : x))
    try { await api('/api/live/setlist', { songId: id }) } catch { void loadSongs() }
  }

  // ── rating (the show on air, or the one that just ended) ──
  const [last, setLast] = useState<{ occId: string; title: string; end: number } | null>(null)
  useEffect(() => {
    if (np?.isShow && np.occId) queueMicrotask(() => setLast({ occId: np.occId, title: np.showTitle, end: np.showEnd }))
  }, [np?.isShow, np?.occId, np?.showTitle, np?.showEnd])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const rateable = np?.isShow && np.showStart && now > np.showStart + 10 * 60_000
    ? { occId: np.occId, title: np.showTitle }
    : last && now < last.end + 45 * 60_000 && (!np?.isShow || np.occId !== last.occId) ? { occId: last.occId, title: last.title } : null
  const [rating, setRating] = useState<{ avg: number; count: number; mine: number }>({ avg: 0, count: 0, mine: 0 })
  const rid = rateable?.occId ?? ''
  useEffect(() => {
    if (!rid) return
    return poll(() => {
      apiGet<{ avg: number; count: number; mine: number }>(`/api/live/rating?occId=${encodeURIComponent(rid)}`).then(setRating).catch(() => {})
    }, 60_000)
  }, [rid, user?.uid])
  async function rate(stars: number) {
    if (!can) { setMsg('Sign in with your school email to rate.'); return }
    if (!rateable) return
    setRating(r => ({ ...r, mine: stars }))
    try {
      await api('/api/live/rating', { occId: rateable.occId, stars, title: rateable.title })
      setRating(await apiGet<{ avg: number; count: number; mine: number }>(`/api/live/rating?occId=${encodeURIComponent(rateable.occId)}`))
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save your rating.') }
  }

  const sorted = [...songs].sort((a, b) => b.votes - a.votes)
  const accent = np?.color || undefined

  return (
    <div className="mt-4 space-y-4">
      {np?.note && (
        <div className="sk-raised rounded-2xl p-4 border-l-4" style={{ borderLeftColor: accent ?? 'var(--br-accent)' }}>
          {np.note.headline && <p className="text-br-dk-text font-medium">{np.note.headline}</p>}
          {np.note.message && <p className="text-sm text-br-dk-sub whitespace-pre-wrap">{np.note.message}</p>}
          {np.note.by && <p className="text-xs text-br-dk-muted mt-1">from {np.note.by}</p>}
        </div>
      )}

      {occId && (
        <div className="sk-raised rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-br-dk-sub">React</span>
          {EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`}
                    className="sk-key rounded-full h-10 px-3 flex items-center gap-2 text-lg active:scale-95 transition-transform">
              <span>{e}</span>
              <span className="text-xs text-br-dk-sub tabular-nums">{(recent[e] ?? 0) + (mineSent[e] ?? 0) || ''}</span>
            </button>
          ))}
          <span className="text-xs text-br-dk-muted">last few minutes</span>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="sk-raised rounded-2xl p-4 space-y-2">
          <p className="font-display text-br-gold tracking-widest text-sm">SET LIST{listTitle ? ` · ${listTitle.toUpperCase()}` : ''}</p>
          <ul className="space-y-1">
            {sorted.map(s => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <button type="button" onClick={() => vote(s.id)} aria-pressed={s.mine} aria-label={`Upvote ${s.text}`}
                        className={`sk-key rounded-lg h-8 min-w-[3rem] px-2 text-xs flex items-center justify-center gap-1 ${s.mine ? 'text-br-gold' : 'text-br-dk-sub'}`}>
                  ▲ <span className="tabular-nums">{s.votes}</span>
                </button>
                <span className="text-br-dk-text truncate">{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rateable && (
        <div className="sk-raised rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-br-dk-text">Rate {rateable.title}</span>
          <span className="flex" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => rate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      className={`text-2xl leading-none px-0.5 ${n <= rating.mine ? 'text-br-gold' : 'text-br-dk-muted'}`}>★</button>
            ))}
          </span>
          {rating.count > 0 && <span className="text-xs text-br-dk-sub">{rating.avg} average · {rating.count} rating{rating.count === 1 ? '' : 's'}</span>}
        </div>
      )}
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
    </div>
  )
}
