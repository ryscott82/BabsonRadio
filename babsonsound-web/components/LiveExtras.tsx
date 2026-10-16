'use client'

import EmojiGlyph from '@/components/EmojiGlyph'
import { reactionTheme } from '@/lib/reactionThemes'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import type { NowPlaying } from '@/lib/nowplaying'
import EmojiRain, { rain, rainBurst } from './EmojiRain'
import { useArtMain } from '@/components/ArtTheme'

// Things around the live player: a pinned note from the host, quick reactions, the host's set list with upvotes,
// and star ratings for the show. Everyone can see them; students (and developers) can take part.

const EMOJIS = ['🔥', '❤️', '🦫', '🤘']
const poll = (fn: () => void, ms: number) => {
  fn()
  const t = setInterval(() => { if (!document.hidden) fn() }, ms)
  return () => clearInterval(t)
}

let lastTap = 0
const tooSoon = () => { const n = Date.now(); const r = n - lastTap < 500; if (!r) lastTap = n; return r }

interface Song { id: string; text: string; votes: number; mine: boolean }

export default function LiveExtras({ np, compact = false }: { np: NowPlaying | null; compact?: boolean }) {
  const card = compact ? 'sk-raised rounded-xl p-3' : 'sk-raised rounded-2xl p-4'
  const { hasMemberAccess, user } = useAuth()
  const can = !!user && hasMemberAccess
  // The reaction row: the usual ones plus any this person has earned (the server decides which).
  const [emojis, setEmojis] = useState<string[]>(EMOJIS)
  useEffect(() => {
    if (!can) { queueMicrotask(() => setEmojis(EMOJIS)); return }
    const load = () => apiGet<{ emojis: string[] }>('/api/live/emojis').then(r => setEmojis(r.emojis)).catch(() => {})
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => clearInterval(t)
  }, [can, user?.uid])
  const occId = np?.occId ?? ''

  // Invisible mode switches off the social bits: reactions (sending and seeing them).
  const [invisible, setInvisible] = useState(false)
  useEffect(() => {
    if (!can) { queueMicrotask(() => setInvisible(false)); return }
    apiGet<{ invisible: boolean }>('/api/me').then(r => setInvisible(r.invisible)).catch(() => {})
  }, [can, user?.uid])

  // ── reactions: tap one and a handful rain down on every screen ──
  const [msg, setMsg] = useState('')
  const cid = useId().replace(/[^A-Za-z0-9]/g, '')
  const since = useRef(0)
  useEffect(() => {
    if (!occId || invisible) return
    since.current = 0
    return poll(() => {
      apiGet<{ occId: string; events: { at: number; e: string; c: string }[]; now: number }>('/api/live/reactions')
        .then(r => {
          if (r.occId !== occId) return
          const first = since.current === 0 // do not replay what happened before we arrived
          const fresh = r.events.filter(x => x.c !== cid && x.at > since.current)
          if (!first) fresh.forEach(x => rain(x.e, 1, 2_500))
          since.current = Math.max(since.current, r.events.length ? r.events[r.events.length - 1].at : 0, r.now - 4_000)
        }).catch(() => {})
    }, 2_000)
  }, [occId, cid, invisible])
  async function react(e: string) {
    if (!can) { setMsg('Sign in with your school email to react.'); return }
    setMsg(''); rainBurst(e)
    if (tooSoon()) return
    try { await api('/api/live/reactions', { emoji: e, cid }) }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not send.') }
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
  const [last, setLast] = useState<{ occId: string; title: string; end: number; isShow: boolean } | null>(null)
  useEffect(() => {
    if (np?.occId) queueMicrotask(() => setLast({ occId: np.occId, title: np.showTitle || np.blockTitle, end: np.showEnd, isShow: np.isShow }))
  }, [np?.occId, np?.showTitle, np?.blockTitle, np?.showEnd, np?.isShow])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const rateable = np?.occId && np.showStart && now > np.showStart + 10 * 60_000
    ? { occId: np.occId, title: np.showTitle || np.blockTitle, isShow: np.isShow }
    : last && now < last.end + 45 * 60_000 && (!np?.occId || np.occId !== last.occId) ? { occId: last.occId, title: last.title, isShow: last.isShow } : null
  const [rating, setRating] = useState<{ avg: number; count: number; mine: number }>({ avg: 0, count: 0, mine: 0 })
  const rid = rateable?.occId ?? ''
  useEffect(() => {
    if (!rid) return
    return poll(() => {
      apiGet<{ avg: number; count: number; mine: number }>(`/api/live/rating?occId=${encodeURIComponent(rid)}`).then(setRating).catch(() => {})
    }, 60_000)
  }, [rid, user?.uid])
  // End-of-show feedback: from 5 minutes before the show ends until 45 minutes after, ask for stars and a short comment.
  const endsAt = rateable ? (np?.occId === rateable.occId ? np.showEnd : last?.end ?? 0) : 0
  const closing = !!rateable && rateable.isShow && endsAt > 0 && now >= endsAt - 5 * 60_000
  const [comment, setComment] = useState('')
  const [commentSent, setCommentSent] = useState('')
  async function sendFeedback() {
    if (!can) { setMsg('Sign in with your school email to send feedback.'); return }
    if (!rateable || !rating.mine) { setMsg('Pick a star rating first.'); return }
    try {
      await api('/api/live/rating', { occId: rateable.occId, stars: rating.mine, title: rateable.title, comment })
      setCommentSent(rateable.occId); setMsg('Thanks! Your feedback goes to the host.')
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not send your feedback.') }
  }
  async function rate(stars: number) {
    if (!can) { setMsg('Sign in with your school email to rate.'); return }
    if (!rateable) return
    setRating(r => ({ ...r, mine: stars }))
    try {
      await api('/api/live/rating', { occId: rateable.occId, stars, title: rateable.title })
      setRating(await apiGet<{ avg: number; count: number; mine: number }>(`/api/live/rating?occId=${encodeURIComponent(rateable.occId)}`))
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save your rating.') }
  }

  // ── rate the song that is playing ──
  const songKey = np?.title && !np.showOnly ? `${np.artist}|${np.title}` : ''
  const [songStars, setSongStars] = useState<{ key: string; n: number }>({ key: '', n: 0 })
  useEffect(() => {
    if (!songKey || !np) return
    let live = true
    apiGet<{ mine: number }>(`/api/live/song-rating?title=${encodeURIComponent(np.title)}&artist=${encodeURIComponent(np.artist)}`)
      .then(r => { if (live) setSongStars({ key: songKey, n: r.mine }) }).catch(() => { if (live) setSongStars({ key: songKey, n: 0 }) })
    return () => { live = false }
  }, [songKey, np, user?.uid])
  const mineSong = songStars.key === songKey ? songStars.n : 0
  async function rateSong(n: number) {
    if (!can) { setMsg('Sign in with your school email to rate songs.'); return }
    if (!np) return
    setSongStars({ key: songKey, n })
    try { await api('/api/live/song-rating', { title: np.title, artist: np.artist, stars: n }) }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save your rating.') }
  }

  const art = useArtMain()
  const sorted = [...songs].sort((a, b) => b.votes - a.votes)
  const accent = art.full ? (np?.color || undefined) : undefined

  return (
    <div className="mt-4 space-y-4">
      <EmojiRain />
      {np?.note && (
        <div className={`${card} border-l-4`} style={{ borderLeftColor: accent ?? 'var(--br-accent)' }}>
          {np.note.headline && <p className="text-br-dk-text font-medium">{np.note.headline}</p>}
          {np.note.message && <p className="text-sm text-br-dk-sub whitespace-pre-wrap">{np.note.message}</p>}
          {np.note.by && <p className="text-xs text-br-dk-muted mt-1">from {np.note.by}</p>}
        </div>
      )}

      {occId && invisible && (
        <p className="text-xs text-br-dk-sub text-center">Reactions are off while Invisible mode is on. Turn it off in your profile to join in.</p>
      )}
      {occId && !invisible && (
        <div className={`${card} flex flex-wrap items-center gap-3`}>
          <span className="text-xs text-br-dk-sub">React</span>
          {(reactionTheme(np?.artist) ?? emojis).map(e => (
            <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`}
                    className="sk-key rounded-full h-9 w-10 flex items-center justify-center text-base active:scale-90 transition-transform">
              <EmojiGlyph e={e} size="1.3rem" />
            </button>
          ))}
        </div>
      )}

      {songKey && (
        <div className={`${card} flex flex-wrap items-center gap-3`}>
          <span className="text-sm text-br-dk-text truncate max-w-full">Rate this song</span>
          <span className="flex" role="group" aria-label="Song rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => rateSong(n)} aria-label={`${n} star${n > 1 ? 's' : ''} for this song`}
                      className={`text-xl leading-none px-0.5 ${n <= mineSong ? 'text-br-gold' : 'text-br-dk-muted'}`}>★</button>
            ))}
          </span>
        </div>
      )}

      {sorted.length > 0 && (
        <div className={`${card} space-y-2`}>
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

      {rateable && closing && (
        <div className={`${card} space-y-3`}>
          <p className="text-br-dk-text font-medium">{endsAt > now ? 'Almost over' : 'That was'}: {rateable.title}. How was it?</p>
          <span className="flex" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => rate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      className={`text-2xl leading-none px-0.5 ${n <= rating.mine ? 'text-br-gold' : 'text-br-dk-muted'}`}>★</button>
            ))}
          </span>
          {commentSent === rateable.occId ? (
            <p className="text-sm text-br-gold">Thanks! Your feedback goes to the host.</p>
          ) : (
            <>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} maxLength={280}
                        placeholder="Anything the host should know? (optional)" className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" />
              <button type="button" onClick={sendFeedback} className="sk-btn font-display tracking-[0.2em] text-xs px-5 py-2.5 rounded-lg">SEND FEEDBACK</button>
            </>
          )}
        </div>
      )}
      {msg && <p role="status" className="text-sm text-br-gold">{msg}</p>}
    </div>
  )
}
