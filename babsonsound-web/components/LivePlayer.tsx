'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { fetchPresence, friendsLine, sendHeartbeat } from '@/lib/presence'
import { useAuth } from '@/contexts/AuthContext'
import { useNowPlaying } from '@/lib/nowplaying'
import Visualizer from '@/components/Visualizer'
import LiveExtras from '@/components/LiveExtras'
import SkipButton from '@/components/SkipButton'
import { useArtColor } from '@/lib/artColor'
import { useArtMain } from '@/components/ArtTheme'
import { useWide } from '@/lib/useWide'

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? ''

export default function LivePlayer({ pane = false }: { pane?: boolean }) {
  const [isPlaying, setIsPlaying]     = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [friends, setFriends] = useState<{ firstName: string }[]>([])
  const [groups, setGroups] = useState<{ text: string }[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { loading, user, canListenLive: memberListen, isGuest } = useAuth()
  // Signed-out visitors can preview the live stream; they get a sign-up prompt every 5 minutes of listening.
  const previewing = !loading && !user
  const canListenLive = memberListen || previewing
  const [prompt, setPrompt] = useState(false)
  const np = useNowPlaying()
  const wide = useWide()
  const hasSong = !!np?.configured && !!np.title
  // Color of the glow: the on-air event's color, else the cover's main color, else the station green.
  const artColor = useArtColor(np?.art || undefined)
  const art = useArtMain()
  // With the album-color theme on, the glow follows the page's fade (green first, then the cover's main color).
  const glow = np?.color || (art.on ? art.main : artColor) || ''

  // Full screen board (for a screen on the wall): just the music, big, over the visualizer.
  const [board, setBoard] = useState(false)
  const [awake, setAwake] = useState(true)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const openBoard = useCallback(() => {
    setBoard(true); setAwake(true)
    queueMicrotask(() => boardRef.current?.requestFullscreen?.().catch(() => {}))
  }, [])
  const closeBoard = useCallback(() => {
    setBoard(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    if (!board) return
    const onFs = () => { if (!document.fullscreenElement) setBoard(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBoard() }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey) }
  }, [board, closeBoard])
  // Controls fade away a few seconds after the mouse stops, so the board stays clean.
  useEffect(() => {
    if (!board || !awake) return
    const t = setTimeout(() => setAwake(false), 3500)
    return () => clearTimeout(t)
  }, [board, awake])
  const [clock, setClock] = useState(0)
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t) }, [])
  // Progress between polls: elapsed at the time of the last poll plus the seconds since.
  const pct = np && np.duration > 0
    ? Math.min(100, ((np.elapsed + Math.max(0, clock - np.receivedAt) / 1000) / np.duration) * 100) : 0

  // Stop immediately if access lapses (sign-out).
  useEffect(() => {
    if (!loading && !canListenLive && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      queueMicrotask(() => { setIsPlaying(false); setIsBuffering(false) })
    }
  }, [loading, canListenLive])

  // Listener count + connected friends (names only for verified students, never invisible people).
  useEffect(() => {
    let alive = true
    const load = () => fetchPresence().then(p => { if (alive) { setListenerCount(p.count); setFriends(p.friends); setGroups(p.groups ?? []) } })
    load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [user?.uid])

  // Every 5 minutes of listening while signed out, invite them to make an account (the audio keeps playing).
  useEffect(() => {
    if (!isPlaying || !previewing) return
    let seconds = 0
    const t = setInterval(() => { if (++seconds >= 300) { seconds = 0; setPrompt(true) } }, 1000)
    return () => clearInterval(t)
  }, [isPlaying, previewing])
  useEffect(() => { if (user) queueMicrotask(() => setPrompt(false)) }, [user])

  // Heartbeat while playing so the server knows we're tuned in.
  useEffect(() => {
    if (!isPlaying) return
    sendHeartbeat(true)
    const t = setInterval(() => sendHeartbeat(true), 120_000)
    return () => { clearInterval(t); sendHeartbeat(false) }
  }, [isPlaying])

  function togglePlay() {
    if (!canListenLive) return
    if (!audioRef.current) {
      audioRef.current = new Audio(STREAM_URL)
      audioRef.current.addEventListener('waiting', () => setIsBuffering(true))
      audioRef.current.addEventListener('playing', () => setIsBuffering(false))
    }

    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.src = ''
      setIsPlaying(false)
    } else {
      setIsBuffering(true)
      audioRef.current.src = STREAM_URL
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error)
    }
  }

  return (
    <>
    <div className="relative overflow-hidden rounded-2xl sk-hero grain">
      {/* Animated background, tinted with the on-air event's color */}
      {!board && <Visualizer color={glow} playing={isPlaying} follow={art.on && !np?.color} />}

      <div className={`relative p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 ${pane ? 'lg:flex-col lg:p-8' : ''}`}>

        {/* Art block */}
        <div className={`relative shrink-0 w-44 h-44 md:w-56 md:h-56 rounded-xl overflow-hidden grain flex items-center justify-center ${np?.color ? '' : 'bg-gradient-to-br from-[#003D27] to-[#006644]'}`}
             style={np?.color ? { background: `linear-gradient(135deg, ${np.color}, ${np.color}66 70%, #000000aa)`, boxShadow: `0 0 40px ${np.color}55` } : undefined}>
          {np?.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={np.art} alt={hasSong ? `Cover for ${np.title}` : ''} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <p className="font-display text-br-brass/80 text-sm tracking-[0.4em]">BABSON</p>
              <p className="font-display text-white text-4xl tracking-[0.2em]">RADIO</p>
            </div>
          )}
          {/* Gold stripe */}
          <div className="absolute bottom-8 inset-x-0 h-px bg-br-brass/50" />
          {/* LED */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-br-green shadow-[0_0_6px_#006644]' : 'bg-br-dk-muted'}`} />
            <span className="font-display text-[9px] tracking-[0.2em] text-white/40">INTERNET RADIO</span>
          </div>
        </div>

        {/* Info + controls */}
        <div className={`flex-1 text-center md:text-left ${pane ? 'lg:text-center' : ''}`}>
          {/* ON AIR badge */}
          <div className="inline-flex items-center gap-1.5 bg-br-red px-3 py-1 rounded mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
            <span className="font-display text-white text-xs tracking-[0.25em]">On Air</span>
          </div>

          <h2 className="font-display text-br-dk-text text-3xl md:text-4xl tracking-wide mb-1">
            {hasSong ? np!.title : 'Live Stream'}
          </h2>
          <p className="text-br-dk-sub text-sm mb-1">
            {hasSong ? (np!.artist || 'Babson Radio') : 'Babson College — Internet Radio'}
          </p>
          {np?.showTitle && <p className="text-xs mb-1" style={{ color: np.color || undefined }}>On air: {np.showTitle}</p>}
          {hasSong && np!.isLive && np!.streamer && (
            <p className="text-br-gold text-xs mb-1">Live with {np!.streamer}</p>
          )}
          {hasSong && np!.duration > 0 && (
            <div className="h-1 w-full max-w-xs mx-auto md:mx-0 rounded-full bg-br-dk-border overflow-hidden mt-2" aria-hidden>
              <div className="h-full bg-br-gold" style={{ width: `${pct}%` }} />
            </div>
          )}
          {hasSong && np!.next && (
            <p className="text-br-dk-sub text-xs mt-2">Next: {np!.next.title}{np!.next.artist ? ` · ${np!.next.artist}` : ''}</p>
          )}
          <div className="mb-6" />

          {previewing && (
            <p className="text-br-dk-sub text-xs mb-4">
              You are previewing the live stream. <Link href="/auth" className="text-br-gold">Sign in</Link> or{' '}
              <Link href="/auth" className="text-br-gold">create a free account</Link> for reminders, friends and more.
            </p>
          )}
          {!loading && !canListenLive && (
            <p className="text-br-dk-sub text-sm mb-4">
              {!user
                ? <>Sign in to listen. No Babson email? <Link href="/auth/guest" className="text-br-gold">Create a guest account</Link>.</>
                : isGuest
                  ? <>Listening isn&apos;t available right now. Try again in a moment.</>
                  : <>Verify your Babson email to listen. <Link href="/auth" className="text-br-gold">Continue</Link>.</>}
            </p>
          )}

          {/* EQ animation + play button */}
          <div className={`flex items-center gap-5 justify-center md:justify-start ${pane ? 'lg:justify-center' : ''}`}>
            <button
              onClick={togglePlay}
              disabled={!canListenLive}
              aria-pressed={isPlaying} className="sk-btn disabled:opacity-40 w-16 h-16 rounded-full flex items-center justify-center"
            >
              {isBuffering ? (
                <svg className="w-6 h-6 animate-spin text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : isPlaying ? (
                <svg className="w-6 h-6 text-current" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg className="w-6 h-6 text-current translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <SkipButton np={np} />

            {/* EQ bars */}
            {isPlaying && (
              <div className="flex items-end gap-1 h-8">
                {[1,2,3,4].map(i => (
                  <div
                    key={i}
                    className="eq-bar w-1 bg-br-gold rounded-full"
                    style={{ height: '100%', animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            )}

            {/* Listener count */}
            {listenerCount > 0 && (
              <span className="text-br-dk-sub text-sm">
                {listenerCount} listening
                {friends.length > 0 && <> · {friendsLine(friends)}</>}
              </span>
            )}
          </div>
          <button onClick={openBoard} className="hidden lg:inline-block mt-4 text-xs text-br-dk-sub hover:text-br-gold font-display tracking-[0.2em]">
            FULL SCREEN
          </button>
          {groups.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-br-gold">
              {groups.slice(0, 3).map(g => <li key={g.text}>{g.text}</li>)}
            </ul>
          )}
        </div>
      </div>
      {prompt && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setPrompt(false)}>
          <div role="dialog" aria-modal="true" aria-label="Create an account" onClick={e => e.stopPropagation()}
               className="sk-raised rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <h3 className="font-display text-br-dk-text text-2xl tracking-wide">Enjoying Babson Radio?</h3>
            <p className="text-sm text-br-dk-sub">Create a free account to get show reminders, see who is tuned in, and keep your place. The music keeps playing.</p>
            <Link href="/auth" className="sk-btn block rounded-xl py-3 text-sm font-display tracking-[0.2em]">CREATE ACCOUNT OR SIGN IN</Link>
            <button onClick={() => setPrompt(false)} className="text-sm text-br-dk-sub">Keep listening</button>
          </div>
        </div>
      )}
    </div>
    {!(pane && wide) && <LiveExtras np={np} />}
    {board && createPortal(
      <div ref={boardRef} onMouseMove={() => setAwake(true)} onClick={() => setAwake(true)}
           className={`fixed inset-0 z-[100] bg-black overflow-hidden flex items-center justify-center ${awake ? '' : 'cursor-none'}`}>
        <Visualizer inline color={glow} playing={isPlaying} className="absolute inset-0 w-full h-full pointer-events-none scale-110 blur-[8px]" />
        <div className="relative flex flex-col md:flex-row items-center gap-10 md:gap-16 px-10 max-w-[1600px] w-full">
          <div className="shrink-0 w-[min(70vw,46vh)] aspect-square rounded-2xl overflow-hidden shadow-[0_0_120px_var(--glow)]"
               style={{ ['--glow' as string]: (glow || '#2fb67c') + '88', background: glow ? `linear-gradient(135deg, ${glow}, #000000aa)` : '#003D27' }}>
            {np?.art
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={np.art} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex flex-col items-center justify-center"><p className="font-display text-br-brass/80 tracking-[0.4em]">BABSON</p><p className="font-display text-white text-6xl tracking-[0.2em]">RADIO</p></div>}
          </div>
          <div className="text-center md:text-left min-w-0">
            <h2 className="font-display text-white text-[clamp(2.5rem,6vw,6rem)] leading-[1.05] tracking-wide">{hasSong ? np!.title : 'Babson Radio'}</h2>
            <p className="text-white/80 text-[clamp(1.25rem,2.6vw,2.75rem)] mt-3">{hasSong ? (np!.artist || '') : 'Live from campus'}</p>
            {np?.showTitle && <p className="mt-6 text-[clamp(1rem,1.8vw,1.75rem)] font-display tracking-[0.2em]" style={{ color: glow || '#fff' }}>{np.showTitle}</p>}
            {hasSong && np!.next && <p className="mt-8 text-white/50 text-[clamp(0.9rem,1.4vw,1.4rem)]">Next: {np!.next.title}{np!.next.artist ? ` · ${np!.next.artist}` : ''}</p>}
          </div>
        </div>
        <p className="absolute bottom-6 left-8 font-display tracking-[0.4em] text-white/40 text-sm">BABSON RADIO</p>
        <div className={`absolute top-5 right-5 flex gap-3 transition-opacity duration-500 ${awake ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button onClick={togglePlay} disabled={!canListenLive} className="text-white/80 hover:text-white text-xs font-display tracking-[0.2em] border border-white/30 rounded px-3 py-1.5">
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <button onClick={closeBoard} className="text-white/80 hover:text-white text-xs font-display tracking-[0.2em] border border-white/30 rounded px-3 py-1.5">EXIT</button>
        </div>
      </div>,
      document.body,
    )}
    </>
  )
}
