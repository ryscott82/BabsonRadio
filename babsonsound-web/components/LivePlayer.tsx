'use client'

import SongLinks from '@/components/SongLinks'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { fetchPresence, friendsLine, sendHeartbeat } from '@/lib/presence'
import { useAuth } from '@/contexts/AuthContext'
import { useNowPlaying } from '@/lib/nowplaying'
import FitTitle from '@/components/FitTitle'
import OnAirSign from '@/components/OnAirSign'
import FullBoard from '@/components/FullBoard'
import SkipButton from '@/components/SkipButton'
import VolumeKnob from '@/components/VolumeKnob'
import { ExtrasStack, ReactionKeys } from '@/components/LiveExtras'
import { useArtColor, useArtPalette } from '@/lib/artColor'
import { useArtMain } from '@/components/ArtTheme'
import { useListenGuard } from '@/lib/listenGuard'
import { useHeld } from '@/lib/settle'
import { takeTryIt } from '@/lib/splash'
import { applyVolume, elementVolumeWorks, attachSpectrum, probeCors, registerAudio, sharedAudio, setBoostDb, useLedSpectrum, wakeSpectrum } from '@/lib/spectrum'

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? ''

// Equalizer bars: fixed pseudo-random heights and timings so server and client render the same markup.
const CHIP = ['#E8A9A0', '#EBCB8B', '#A8D0A2', '#9CC3DB', '#C9A9D8', '#E6B88A', '#A7D4C7', '#D9A0B8']
const EQ_BARS = Array.from({ length: 40 }, (_, i) => ({ h: 0.4 + ((i * 37) % 10) / 16, d: ((i * 13) % 10) / 10, t: 0.7 + ((i * 53) % 7) / 10 }))

export default function LivePlayer({ pane = false }: { pane?: boolean }) {
  // Phones get a one line title (it shrinks a little, then scrolls) to save space.
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 639px)')
    const on = () => setNarrow(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const [isPlaying, setIsPlaying]     = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [friends, setFriends] = useState<{ firstName: string }[]>([])
  const [groups, setGroups] = useState<{ text: string }[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // The audio element outlives this component (it's shared at module level), so coming back to Live from another page
  // re-adopts the stream that's still playing instead of showing "paused".
  useEffect(() => {
    const el = sharedAudio()
    if (!el) return
    audioRef.current = el
    const onWait = () => setIsBuffering(true)
    const onPlay = () => { setIsBuffering(false); setIsPlaying(true) }
    const onPause = () => { setIsBuffering(false); setIsPlaying(false) }
    el.addEventListener('waiting', onWait); el.addEventListener('playing', onPlay); el.addEventListener('pause', onPause)
    queueMicrotask(() => { if (!el.paused && !el.ended) setIsPlaying(true) })
    return () => { el.removeEventListener('waiting', onWait); el.removeEventListener('playing', onPlay); el.removeEventListener('pause', onPause) }
  }, [])
  const { loading, user, canListenLive: memberListen, isGuest } = useAuth()
  // Signed-out visitors can preview the live stream; they get a sign-up prompt every 5 minutes of listening.
  const previewing = !loading && !user
  const canListenLive = memberListen || previewing
  const [prompt, setPrompt] = useState(false)
  const np = useNowPlaying()
  const stopPlayback = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    setIsPlaying(false); setIsBuffering(false)
  }, [])
  const guard = useListenGuard(isPlaying, stopPlayback)
  const hasSong = !!np?.configured && !!np.title
  // Live shows get the ON AIR sign and "Show name with Host" where the artist goes. The auto DJ keeps the artist, no sign.
  const onAir = !!(np?.isLive || np?.isShow || np?.onAirManual)
  // Lines that would change the amp's height wait a moment, in case the data is only reloading. Their space is reserved so nothing jumps.
  const nextHeld = useHeld(hasSong ? np?.next : null, 1000, 5000)
  const previewHeld = useHeld(!loading && !user ? true : null, 1000, 5000)
  const showLineHeld = useHeld(!onAir && np?.showTitle ? np.showTitle : null, 1000, 5000)
  const subline = onAir && np?.showTitle && !np.showOnly
    ? `${np.showTitle}${np.streamer ? ` with ${np.streamer}` : ''}`
    : (np?.artist || 'Babson Radio')
  // Knob travel: 0..75% is the element volume (0 to 100%); past 75% adds up to +6 dB of boost with a soft clipper (needs a stream that allows Web Audio).
  const UNITY = 0.75, MAX_DB = 6
  const [volume, setVolume] = useState(0.64)
  const [canBoost, setCanBoost] = useState(false)
  useEffect(() => {
    probeCors(STREAM_URL).then(setCanBoost).catch(() => {})
    try {
      const v = Number(localStorage.getItem('br-vol2')), old = Number(localStorage.getItem('br-vol'))
      const start = v > 0 && v <= 1 ? v : old > 0 && old <= 1 ? old * UNITY : 0
      if (start > 0) queueMicrotask(() => setVolume(start))
    } catch { /* ignore */ }
  }, [])
  // Staff can switch the browser audio processing off for everyone (admin dashboard): no analyser, no boost.
  const fxOn = np?.audioFx !== false
  const fxRef = useRef(true)
  useEffect(() => { fxRef.current = fxOn }, [fxOn])
  const level = canBoost && fxOn ? volume : Math.min(volume, UNITY)
  const boostDb = level > UNITY ? ((level - UNITY) / (1 - UNITY)) * MAX_DB : 0
  useEffect(() => {
    if (audioRef.current) applyVolume(audioRef.current, level / UNITY)
    setBoostDb(boostDb)
    try { localStorage.setItem('br-vol2', String(volume)) } catch { /* ignore */ }
  }, [volume, level, boostDb])
  // Color of the record's center label: always the album picture's dominant color (the station green until a cover loads).
  const artColor = useArtColor(np?.art || undefined)
  const palette = useArtPalette(np?.art || undefined)
  const glow = palette[0] || artColor || ''
  // The cover's own backdrop and filter still follow the page's color mode and the on-air show's color.
  const art = useArtMain()
  const showColor = art.full ? (np?.color || '') : ''

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
  // Tell the emoji rain the board is up, so reactions from phones fall big over it (even if the browser refuses full screen).
  useEffect(() => {
    if (!board) return
    document.body.dataset.board = '1'
    return () => { delete document.body.dataset.board }
  }, [board])
  // Controls fade away a few seconds after the mouse stops, so the board stays clean.
  useEffect(() => {
    if (!board || !awake) return
    const t = setTimeout(() => setAwake(false), 3500)
    return () => clearTimeout(t)
  }, [board, awake])
  const eqRef = useRef<HTMLDivElement | null>(null)
  const boardEqRef = useRef<HTMLDivElement | null>(null)
  useLedSpectrum(eqRef, isPlaying)
  useLedSpectrum(boardEqRef, isPlaying && board, 12)
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
    let seconds = 0, total = 0
    const t = setInterval(() => {
      // Signed-out visitors get 10 minutes, then the stream stops and the sign-in invitation shows.
      if (++total >= 600) { stopPlayback(); setPrompt(true); return }
      if (++seconds >= 300) { seconds = 0; setPrompt(true) }
    }, 1000)
    return () => clearInterval(t)
  }, [isPlaying, previewing, stopPlayback])
  useEffect(() => { if (user) queueMicrotask(() => setPrompt(false)) }, [user])

  // Heartbeat while playing so the server knows we're tuned in.
  useEffect(() => {
    if (!isPlaying) return
    sendHeartbeat(true)
    const t = setInterval(() => sendHeartbeat(true), 120_000)
    return () => { clearInterval(t); sendHeartbeat(false) }
  }, [isPlaying])

  // Warm the cross-origin check now so the first tap on Play isn't delayed by it.
  useEffect(() => { probeCors(STREAM_URL).catch(() => {}) }, [])

  async function togglePlay() {
    if (!canListenLive) return
    wakeSpectrum()
    if (!audioRef.current) {
      const el = new Audio()
      // Real equalizer needs a cross-origin-readable stream. Only opt in when the server allows it, so playback never breaks.
      if ((fxRef.current || !elementVolumeWorks()) && await probeCors(STREAM_URL)) { el.crossOrigin = 'anonymous'; if (!attachSpectrum(el)) el.removeAttribute('crossorigin') }
      audioRef.current = el
      registerAudio(el)
      applyVolume(audioRef.current, level / UNITY); setBoostDb(boostDb)
      el.addEventListener('waiting', () => setIsBuffering(true))
      el.addEventListener('playing', () => setIsBuffering(false))
      el.addEventListener('pause', () => { setIsBuffering(false); setIsPlaying(false) })
    }

    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.src = ''
      setIsPlaying(false)
    } else {
      if (!(await guard.begin())) return
      startAudio()
    }
  }

  // The first-visit splash's "Try it out" starts the stream here, from the same tap.
  const tryRef = useRef({ go: () => {}, playing: false, ok: false })
  useEffect(() => { tryRef.current = { go: () => { void togglePlay() }, playing: isPlaying, ok: canListenLive } })
  useEffect(() => {
    const run = () => { if (takeTryIt() && tryRef.current.ok && !tryRef.current.playing) tryRef.current.go() }
    window.addEventListener('br:try-it', run)
    run()
    return () => window.removeEventListener('br:try-it', run)
  }, [])

  function startAudio() {
    if (!audioRef.current) {
      audioRef.current = new Audio(STREAM_URL)
      audioRef.current.addEventListener('waiting', () => setIsBuffering(true))
      audioRef.current.addEventListener('playing', () => setIsBuffering(false))
    }
    setIsBuffering(true)
    audioRef.current.src = STREAM_URL
    audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error)
  }

  /** The person chose to listen here: the other device stops at its next check-in. */
  async function playHere() {
    if (await guard.begin(true)) startAudio()
  }

  return (
    <>
    <div className={`relative ${pane ? '' : ''}`}>
      <div className={`flex flex-col gap-8 ${pane ? 'lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:items-center' : 'md:flex-row md:items-center md:gap-12'}`}>

        {/* Cover on the desk, record peeking out, ON AIR sign on its corner (live shows only) */}
        <div className={`relative w-full max-w-[24rem] mx-auto pr-[28%] shrink-0 ${pane ? 'lg:max-w-[37rem] lg:mx-0' : ''}`}>
          <div className="hw-cover" style={glow ? ({ ['--hw-label' as string]: glow }) : undefined}>
            <div className="hw-vinyl" aria-hidden />
            <div className="hw-cover-art flex items-center justify-center"
                 style={showColor ? { background: `linear-gradient(135deg, ${showColor}, ${showColor}66 70%, #000000aa)` } : { background: 'linear-gradient(135deg,#003D27,#006644)' }}>
              {np?.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={np.art} alt={hasSong ? `Cover for ${np.title}` : ''} className="absolute inset-0 w-full h-full object-cover"
                     style={art.full ? undefined : { filter: 'var(--cover-filter)' }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/beaver.png" alt="" className="w-[62%] h-auto drop-shadow-[0_3px_6px_rgba(0,0,0,.45)]" />
              )}
            </div>
            {onAir && <OnAirSign />}
          </div>
        </div>

        {/* The amp */}
        <div className="hw-panel hw-big min-w-0 max-sm:-mx-4">
          <FitTitle marquee lines={narrow ? 1 : 2} text={hasSong ? np!.title : 'Live Stream'} className="hw-title hw-title-fit text-[2.75rem] lg:text-[3.1rem]" />
          <p className="hw-sub !text-br-dk-text text-lg font-medium line-clamp-2 mt-0.5">
            {hasSong ? subline : 'Babson College — Internet Radio'}
          </p>
          <p className="hw-sub text-sm mt-1 min-h-[1.25rem]">{showLineHeld ? `On air: ${showLineHeld}` : ''}</p>
          <div className={`hw-prog mt-5 ${hasSong && np!.duration > 0 ? '' : 'invisible'}`} aria-hidden><i style={{ width: `${hasSong && np!.duration > 0 ? pct : 0}%` }} /></div>
          <p className="hw-sub text-sm mt-2 line-clamp-2 min-h-[2.5rem]">{nextHeld ? `Next: ${nextHeld.title}${nextHeld.artist ? ` · ${nextHeld.artist}` : ''}` : ''}</p>

          {previewHeld && (
            <p className="hw-sub text-sm mt-3">
              You are previewing the live stream. <Link href="/auth" className="text-br-gold underline">Sign in</Link> or{' '}
              <Link href="/auth" className="text-br-gold underline">create a free account</Link> for reminders, friends and more.
            </p>
          )}
          {!loading && !canListenLive && (
            <p className="hw-sub text-sm mt-3">
              {!user
                ? <>Sign in or <Link href="/auth?mode=create" className="text-br-gold underline">create an account</Link> to listen.</>
                : isGuest
                  ? <>Listening is unavailable. Try again.</>
                  : <>Verify your email to listen. <Link href="/auth" className="text-br-gold underline">Continue</Link>.</>}
            </p>
          )}

          <div className="hw-well mt-3" aria-hidden>
            <div ref={eqRef} className="hw-eq hw-led" data-on={isPlaying}>
              {EQ_BARS.map((b, i) => (
                <i key={i} style={{ ['--h' as string]: b.h, animationDelay: `${b.d}s`, animationDuration: `${b.t}s` }} />
              ))}
            </div>
          </div>

          {/* Volume knob, play knob, skip knob */}
          <div className="grid grid-cols-3 items-start gap-4 mt-5">
            <div className="justify-self-center"><VolumeKnob value={level} onChange={setVolume} max={canBoost && fxOn ? 1 : UNITY} unity={UNITY} boostDb={boostDb} /></div>
            <div className="justify-self-center pt-1">
              <button
                onClick={togglePlay}
                disabled={!canListenLive}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                aria-pressed={isPlaying}
                className="sk-btn hw-knob disabled:opacity-40 w-[84px] h-[84px] rounded-full flex items-center justify-center"
              >
                {isBuffering ? (
                  <svg className="w-7 h-7 animate-spin text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-7 h-7 text-current" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-current translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
            </div>
            <div className="justify-self-center pt-3"><SkipButton np={np} /></div>
          </div>
          {guard.notice && (
            <p role="status" className="text-br-gold text-sm mt-3 text-center">{guard.notice}</p>
          )}

          <ReactionKeys className="mt-6" />

          {/* Song links and full screen on one row of keys */}
          <div className="flex items-center gap-3 mt-6">
            {hasSong && !np!.showOnly && !np!.isLive && <SongLinks keys title={np!.title} artist={np!.artist} />}
            <button onClick={openBoard} className="hidden lg:inline-flex sk-key hw-pill items-center gap-2 h-8 px-4 rounded-lg text-sm font-bold tracking-[0.12em] ml-auto shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
              FULL SCREEN
            </button>
          </div>

          {/* Tuned in: count and a stack of initials, on its own line */}
          {listenerCount > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-sm font-medium text-br-dk-text shrink-0">{listenerCount} tuned in</span>
              <span className="flex -space-x-2 min-w-0" aria-label={friends.length > 0 ? friendsLine(friends) : undefined}>
                {friends.slice(0, 12).map((f, i) => (
                  <span key={`${f.firstName}-${i}`} className="hw-chip" style={{ background: CHIP[i % CHIP.length], zIndex: 20 - i }} title={f.firstName}>{f.firstName[0]?.toUpperCase()}</span>
                ))}
                {listenerCount > Math.min(friends.length, 12) && (
                  <span className="hw-chip hw-chip-more">+{listenerCount - Math.min(friends.length, 12)}</span>
                )}
              </span>
            </div>
          )}
          {groups.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm text-br-gold">
              {groups.slice(0, 3).map(g => <li key={g.text}>{g.text}</li>)}
            </ul>
          )}
        </div>
      </div>
      {guard.elsewhere && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-label="Already listening on another device" className="sk-raised rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <h3 className="font-display text-br-dk-text text-2xl tracking-wide">Already listening</h3>
            <p className="text-sm text-br-dk-sub">{guard.notice || 'You are listening on another device.'}</p>
            <button onClick={playHere} className="sk-btn block w-full rounded-xl py-3 text-sm font-display tracking-[0.2em]">PLAY HERE</button>
            <button onClick={guard.dismissElsewhere} className="text-sm text-br-dk-sub">Keep listening there</button>
          </div>
        </div>
      )}
      {guard.asking && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-label="Still listening?" className="sk-raised rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <h3 className="font-display text-br-dk-text text-2xl tracking-wide">Still listening?</h3>
            <p className="text-sm text-br-dk-sub">Tap below to keep listening.</p>
            <button onClick={guard.stillHere} className="sk-btn block w-full rounded-xl py-3 text-sm font-display tracking-[0.2em]">Keep listening</button>
          </div>
        </div>
      )}
      {prompt && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setPrompt(false)}>
          <div role="dialog" aria-modal="true" aria-label="Create an account" onClick={e => e.stopPropagation()}
               className="sk-raised rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <h3 className="font-display text-br-dk-text text-2xl tracking-wide">Enjoying Babson Radio?</h3>
            <p className="text-sm text-br-dk-sub">Create a free account for show reminders.</p>
            <Link href="/auth" className="sk-btn block rounded-xl py-3 text-sm font-display tracking-[0.2em]">Create account or sign in</Link>
            <button onClick={() => setPrompt(false)} className="text-sm text-br-dk-sub">Keep listening</button>
          </div>
        </div>
      )}
    </div>
    <div className="mt-8 empty:hidden"><ExtrasStack compact={pane} /></div>
    {board && <FullBoard boardRef={boardRef} eqRef={boardEqRef} np={np} hasSong={hasSong} onAir={onAir} glow={glow} awake={awake} setAwake={setAwake}
                         isPlaying={isPlaying} canPlay={canListenLive} togglePlay={togglePlay} close={closeBoard} />}
    </>
  )
}
