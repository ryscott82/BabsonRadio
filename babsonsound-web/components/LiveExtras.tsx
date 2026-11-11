'use client'

import EmojiGlyph from '@/components/EmojiGlyph'
import { reactionTheme, type EggRule } from '@/lib/reactionThemes'
import { useHeld } from '@/lib/settle'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, apiGetPublic } from '@/lib/auth'
import { ratingView, songsView, type Section } from '@/lib/liveBundle'
import { noteMine, refreshMe, refreshShared, useLiveBundle, useOverlay } from '@/lib/liveStore'
import type { NowPlaying } from '@/lib/nowplaying'
import EmojiRain, { rainBurst, rainFromOthers } from './EmojiRain'
import { useArtMain } from '@/components/ArtTheme'

// Things around the live player: a pinned note from the host, quick reactions, the host's set list with upvotes,
// and star ratings for the show. Everyone can see them; students (and developers) can take part.

const EMOJIS = ['🔥', '❤️', '🦫', '🤘']
// One reaction per 3s is sent to the server (it also allows at most 30 a minute per person). Extra taps inside that window still rain on your own screen, within the bucket in EmojiRain.
let lastTap = 0
const tooSoon = () => { const n = Date.now(); const r = n - lastTap < 3_000; if (!r) lastTap = n; return r }

function useLiveExtrasState(np: NowPlaying | null) {
  const { hasMemberAccess, user } = useAuth()
  const can = !!user && hasMemberAccess
  // ── what is on screen to rate (the show on air, or the one that just ended) ──
  const [last, setLast] = useState<{ occId: string; title: string; end: number; isShow: boolean } | null>(null)
  useEffect(() => {
    if (np?.occId) queueMicrotask(() => setLast({ occId: np.occId, title: np.showTitle || np.blockTitle, end: np.showEnd, isShow: np.isShow }))
  }, [np?.occId, np?.showTitle, np?.blockTitle, np?.showEnd, np?.isShow])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const rateable = np?.occId && np.showStart && now > np.showStart + 10 * 60_000
    ? { occId: np.occId, title: np.showTitle || np.blockTitle, isShow: np.isShow }
    : last && now < last.end + 45 * 60_000 && (!np?.occId || np.occId !== last.occId) ? { occId: last.occId, title: last.title, isShow: last.isShow } : null
  const rid = rateable?.occId ?? ''

  // Reactions, set list and ratings come with the rest of the live page in two shared calls (lib/liveStore.ts), not one call each.
  const sections: Section[] = can ? ['emojis', 'setlist', 'rating'] : []
  const live = useLiveBundle({ sections, occId: rid })

  // The reaction row: the usual ones plus any this person has earned (the server decides which).
  const em = live.me?.emojis
  const [emojis, setEmojis] = useOverlay<string[]>(can && em ? (em.top ?? em.emojis).slice(0, 5) : EMOJIS, live.version)
  // Every reaction this person has unlocked (what a held key can be swapped for).
  const unlocked = can && em ? em.emojis : EMOJIS
  // A show with its own reaction set (or a new show) changes the row: ask for your own half again when that happens.
  const hostSet = np?.hostEmojis?.join('')
  useEffect(() => { if (can) void refreshMe() }, [can, np?.occId, hostSet])
  // Hold a key, pick another unlocked reaction: it takes that key's place (and is remembered on the account).
  const swapKey = useCallback(async (index: number, to: string) => {
    const row = [...emojis]
    const at = row.indexOf(to)
    if (at >= 0) row[at] = row[index]
    row[index] = to
    setEmojis(row)
    try { await api('/api/live/emojis', { slots: row }) } catch { /* the refresh below puts back what the server has */ }
    void refreshMe()
  }, [emojis, setEmojis])
  const [eggs, setEggs] = useState<EggRule[]>([])
  useEffect(() => {
    apiGet<{ eggs: EggRule[] }>('/api/live/easter-eggs').then(r => setEggs(r.eggs)).catch(() => {})
  }, [])
  const occId = np?.occId ?? ''
  const ratingsOn = np?.ratingsOn !== false

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
    // Adaptive: 2s while reactions are flowing, 6s when quiet, off in background tabs. Cuts server work by about two thirds.
    let stop = false, timer: ReturnType<typeof setTimeout>, lastEvent = Date.now()
    const tick = () => {
      if (stop) return
      const next = () => { if (!stop) timer = setTimeout(tick, Date.now() - lastEvent < 30_000 ? 2_000 : 6_000) }
      if (document.hidden) return next()
      apiGetPublic<{ occId: string; events: { at: number; e: string; c: string }[]; now: number }>('/api/live/reactions')
        .then(r => {
          if (r.occId !== occId) return
          const first = since.current === 0 // do not replay what happened before we arrived
          const fresh = r.events.filter(x => x.c !== cid && x.at > since.current)
          if (fresh.length) lastEvent = Date.now()
          if (!first) fresh.forEach(x => rainFromOthers(x.e))
          since.current = Math.max(since.current, r.events.length ? r.events[r.events.length - 1].at : 0, r.now - 4_000)
        }).catch(() => {}).finally(next)
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [occId, cid, invisible])
  async function react(e: string) {
    if (!can) { setMsg('Sign in with your school email to react.'); return }
    setMsg(''); rainBurst(e)
    if (tooSoon()) return
    try { await api('/api/live/reactions', { emoji: e, cid }) }
    catch (err) { setMsg(err instanceof Error ? err.message : 'Could not send.') }
  }

  // ── set list ──
  const view = songsView(live.shared, live.me)
  const [songs, setSongs] = useOverlay<typeof view.songs>(view.songs, live.version)
  const listTitle = view.title
  async function vote(id: string) {
    if (!can) { setMsg('Sign in with your school email to upvote.'); return }
    const next = songs.map(x => x.id === id ? { ...x, mine: !x.mine, votes: x.votes + (x.mine ? -1 : 1) } : x)
    setSongs(next)
    try {
      await api('/api/live/setlist', { songId: id })
      noteMine({ setlist: { occId: live.shared?.setlist.occId ?? '', mine: next.filter(x => x.mine).map(x => x.id) } }) // the new counts reach everyone through the pushed document
    } catch { setSongs(null) }
  }

  // ── rating (the show on air, or the one that just ended) ──
  const [rating, setRating] = useOverlay(ratingView(live.shared, live.me, rid), live.version)
  // End-of-show feedback: from 5 minutes before the show ends until 45 minutes after, ask for stars.
  const endsAt = rateable ? (np?.occId === rateable.occId ? np.showEnd : last?.end ?? 0) : 0
  const closing = !!rateable && rateable.isShow && endsAt > 0 && now >= endsAt - 5 * 60_000
  async function rate(stars: number) {
    if (!can) { setMsg('Sign in with your school email to rate.'); return }
    if (!rateable) return
    setRating({ ...rating, mine: stars })
    try {
      await api('/api/live/rating', { occId: rateable.occId, stars, title: rateable.title })
      noteMine({ rating: { occId: rateable.occId, mine: stars } })
      void refreshShared(true) // shows the new average right away (the shared copy is otherwise up to a minute old)
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not save your rating.'); setRating(null) }
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

  return {
    np, can, user, emojis: reactionTheme(eggs, np) ?? emojis, unlocked, swapKey, swappable: !reactionTheme(eggs, np), invisible, occId, react, msg,
    songKey, ratingsOn, mineSong, rateSong,
    rateable, rating, rate, closing, endsAt, now,
    sorted, listTitle, vote, accent,
  }
}
type Extras = ReturnType<typeof useLiveExtrasState>
const Ctx = createContext<Extras | null>(null)

/** Holds the live page's shared state (reactions, ratings, set list) so the pieces can sit in different cards. */
export function LiveExtrasProvider({ np, children }: { np: NowPlaying | null; children: React.ReactNode }) {
  const v = useLiveExtrasState(np)
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
function useX(): Extras { const v = useContext(Ctx); if (!v) throw new Error('LiveExtrasProvider missing'); return v }

/** The row of reaction keys (steel keys; tap one and a handful rain down on every screen). */
export function ReactionKeys({ className = '' }: { className?: string }) {
  const x = useX()
  const box = useRef<HTMLDivElement>(null)
  const mode = useHeld(x.occId ? (x.invisible ? 'off' : 'on') : null, 600, 4000)
  const [room, setRoom] = useState(99) // how many keys fit on one line (70px keys, 12px gaps)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setRoom(Math.max(1, Math.floor((el.clientWidth + 12) / 82)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])
  // Hold a key for half a second to swap it for another reaction you have unlocked.
  const [swapAt, setSwapAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heldOpen = useRef(false)
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  useEffect(() => cancel, [])
  const begin = (i: number) => {
    if (!x.swappable) return
    cancel()
    timer.current = setTimeout(() => { heldOpen.current = true; setSwapAt(i) }, 500)
  }
  const shown = mode === 'on' ? x.emojis.slice(0, room) : []
  const choices = swapAt === null ? [] : x.unlocked.filter(e => !shown.includes(e))
  // The row's space is always reserved, so keys arriving or leaving never move what is below.
  if (mode === 'off') return <p className={`text-sm hw-sub text-center min-h-[42px] ${className}`}>Reactions are off in Invisible mode.</p>
  return (
    <div ref={box} className={`relative flex flex-nowrap items-center justify-center gap-3 min-h-[42px] ${className}`} role="group" aria-label="Reactions">
      {shown.map((e, i) => (
        <button key={e} type="button"
                onClick={() => { if (heldOpen.current) { heldOpen.current = false; return } x.react(e) }}
                onPointerDown={() => begin(i)} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
                onContextMenu={ev => ev.preventDefault()}
                aria-label={`React ${e}. Hold to swap.`}
                className={`sk-key hw-react rounded-xl h-[42px] w-[70px] flex items-center justify-center active:scale-95 transition-transform select-none touch-manipulation ${swapAt === i ? 'ring-2 ring-white' : ''}`}>
          <EmojiGlyph e={e} size="1.45rem" />
        </button>
      ))}
      {swapAt !== null && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setSwapAt(null)} />
          <div role="dialog" aria-label="Swap reaction" className="hw-panel hw-snug absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 max-w-full">
            <p className="text-sm hw-sub text-center mb-2">Swap for</p>
            {choices.length === 0
              ? <p className="text-sm hw-sub text-center">No other reactions unlocked yet.</p>
              : <div className="flex flex-wrap justify-center gap-2">
                  {choices.map(c => (
                    <button key={c} type="button" onClick={() => { void x.swapKey(swapAt, c); setSwapAt(null) }} aria-label={`Use ${c}`}
                            className="sk-key rounded-xl h-[42px] w-[56px] flex items-center justify-center">
                      <EmojiGlyph e={c} size="1.3rem" />
                    </button>
                  ))}
                </div>}
          </div>
        </>
      )}
    </div>
  )
}

const Stars = ({ n, onPick, label, size = 'text-2xl' }: { n: number; onPick: (v: number) => void; label: string; size?: string }) => (
  <span className="flex gap-0.5" role="group" aria-label={label}>
    {[1, 2, 3, 4, 5].map(v => (
      <button key={v} type="button" onClick={() => onPick(v)} aria-label={`${v} star${v > 1 ? 's' : ''}`}
              className={`hw-star ${size} leading-none px-0.5 ${v <= n ? 'on' : ''}`}>★</button>
    ))}
  </span>
)

/** "Rate this song" and "Rate this show", side by side. Lives in the poll card. */
export function RatingsBlock() {
  const x = useX()
  const song = x.songKey && x.ratingsOn
  const show = x.rateable && x.ratingsOn
  if (!song && !show) return null
  return (
    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-br-dk-border">
      {song ? (
        <div><p className="text-sm hw-sub mb-1 truncate">Rate this song{x.np?.title ? `, ${x.np.title}` : ''}</p>
          <Stars n={x.mineSong} onPick={x.rateSong} label="Song rating" /></div>
      ) : <span />}
      {show && x.rateable ? (
        <div><p className="text-sm hw-sub mb-1 truncate">Rate this show</p>
          <Stars n={x.rating.mine} onPick={x.rate} label="Show rating" /></div>
      ) : <span />}
    </div>
  )
}

/** Pinned host note, set list, and any sign-in messages. Reactions and ratings live elsewhere. */
export function ExtrasStack({ compact = false }: { compact?: boolean }) {
  const x = useX()
  const card = compact ? 'hw-panel hw-snug' : 'hw-panel hw-tight'
  const note = useHeld(x.np?.note, 1500, 6000)
  const setList = useHeld(x.sorted.length > 0 ? x.sorted : null, 1500, 6000)
  return (
    <div className="space-y-4 empty:hidden">
      <EmojiRain />
      {note && (
        <div className={card}>
          {note.headline && <p className="text-br-dk-text font-medium">{note.headline}</p>}
          {note.message && <p className="text-sm text-br-dk-sub whitespace-pre-wrap">{note.message}</p>}
          {note.by && <p className="text-sm text-br-dk-muted mt-1">from {note.by}</p>}
        </div>
      )}
      {setList && (
        <div className={`${card} space-y-2`}>
          <p className="font-display text-br-gold tracking-widest text-sm">SET LIST{x.listTitle ? ` · ${x.listTitle.toUpperCase()}` : ''}</p>
          <ul className="space-y-1">
            {setList.map(s => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <button type="button" onClick={() => x.vote(s.id)} aria-pressed={s.mine} aria-label={`Upvote ${s.text}`}
                        className="sk-key rounded-lg h-8 min-w-[3rem] px-2 text-sm flex items-center justify-center gap-1">
                  ▲ <span className="tabular-nums">{s.votes}</span>
                </button>
                <span className="text-br-dk-text truncate">{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {x.msg && <p role="status" className="text-sm text-br-gold">{x.msg}</p>}
    </div>
  )
}

/** Everything in one stack: used under the player on narrow screens. */
export default function LiveExtras({ np, compact = false }: { np: NowPlaying | null; compact?: boolean }) {
  return (
    <LiveExtrasProvider np={np}>
      <div className="mt-4 space-y-4">
        <div className={compact ? 'hw-panel hw-snug' : 'hw-panel hw-tight'}><ReactionKeys /><RatingsBlock /></div>
        <ExtrasStack compact={compact} />
      </div>
    </LiveExtrasProvider>
  )
}
