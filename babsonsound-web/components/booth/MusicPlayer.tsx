'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { errText, library, loadPref, mmss, savePref, trackUrl, type Track } from './helper'
import { Btn, Ic, Knob, Led } from './es2/Stage'
import { cleanXfade, enqueue, fadeGains, leadSeconds, nextXfade, queueSeconds, removeAt, tapAction } from '@/lib/boothQueue'
import type { LiveMode } from '@/lib/trackLog'

// Tracks from the station's library (through the studio helper): beds for talk shows, or search the whole library.
// Tap a song: it plays when nothing is playing (or only a bed), otherwise it goes to the queue; double tap plays it now. The queue
// plays on its own and each song crossfades into the next (Fade key: off, 2, 4, 6, 8 or 12 seconds). Beds loop and are never queued.
// Two audio players take turns so one can fade out while the next fades in. The Music dial sets the music's volume only.
// Also plays a station ID (from the clock) and the ad break (the Ads playlist, one after another).

const FADE_IN_MS = 1500, FADE_OUT_MS = 3000, GLIDE_MS = 400, TAP_WAIT_MS = 280, ID_FADE_MS = 800

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const startVolume = () => Number(loadPref('musicVolume', '0.6')) || 0.6

export default function MusicPlayer({ getToken, live, output, idCue, adCue, onAired, onIdle, onTrack, mode, onMode }: {
  getToken: () => Promise<string>
  live: boolean
  output: string
  idCue: number
  adCue: number
  /** A track started on air while live (for the play log and the listeners' now-playing). */
  onAired: (t: Track) => void
  /** The music stopped, or an ad or station ID is playing: listeners have no song to show. */
  onIdle?: () => void
  /** The track that is playing now (null when nothing plays). */
  onTrack?: (t: Track | null) => void
  /** Talk show (small now-playing for listeners) or Music show (the song large). */
  mode: LiveMode
  onMode: (m: LiveMode) => void
}) {
  const decks = useRef<SinkAudio[]>([])
  const act = useRef(0)                 // which player carries the current song
  const gain = useRef([1, 1])           // each player's fade, 0 to 1, under the Music dial
  const dial = useRef(startVolume())
  const fade = useRef(0)                // id of the single-player fade running
  const xfId = useRef(0), xfBusy = useRef(false) // the crossfade running
  const [all, setAll] = useState(false)
  const [view, setView] = useState<'lib' | 'queue'>('lib')
  const [q, setQ] = useState('')
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cur, setCur] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [volume, setVolume] = useState(startVolume)
  const [queue, setQueueState] = useState<Track[]>([])
  const [xfade, setXfade] = useState(() => cleanXfade(loadPref('xfade', '')))
  const curRef = useRef<Track | null>(null)
  const queueRef = useRef<Track[]>([])
  const adsRef = useRef<Track[]>([])    // an ad break plays through before the queue goes on
  const xfadeRef = useRef(xfade)
  const setQueue = useCallback((next: Track[]) => { queueRef.current = next; setQueueState(next) }, [])
  useEffect(() => { xfadeRef.current = xfade; savePref('xfade', String(xfade)) }, [xfade])

  const apply = useCallback(() => { decks.current.forEach((d, i) => { d.volume = clamp01(dial.current * gain.current[i]) }) }, [])

  // The audio players. Each reports only while it carries the current song.
  const api = useRef<{ advance: () => void; check: (a: SinkAudio) => void; recover: () => void }>({ advance: () => {}, check: () => {}, recover: () => {} })
  useEffect(() => {
    const list = [0, 1].map(i => {
      const a = new Audio() as SinkAudio
      a.crossOrigin = 'anonymous'; a.preload = 'auto'
      const mine = () => act.current === i
      const time = () => { if (!mine()) return; setPos(a.currentTime); setDur(Number.isFinite(a.duration) ? a.duration : 0) }
      a.addEventListener('timeupdate', () => { time(); if (mine()) api.current.check(a) })
      a.addEventListener('loadedmetadata', time)
      a.addEventListener('play', () => { if (mine()) setPlaying(true) })
      a.addEventListener('pause', () => { if (mine()) setPlaying(false) })
      a.addEventListener('ended', () => { if (mine()) api.current.advance() })
      a.addEventListener('error', () => { if (mine()) api.current.recover() })
      return a
    })
    decks.current = list
    return () => { list.forEach(a => { a.pause(); a.src = '' }) }
  }, [])
  useEffect(() => { decks.current.forEach(a => a.setSinkId?.(output).catch(() => setError('Could not use that music output.'))) }, [output])

  // Search: typing searches the whole library; with an empty box, Beds shows the beds and All shows the library A to Z.
  const searching = q.trim().length > 0
  useEffect(() => {
    let stop = false
    const t = setTimeout(async () => {
      setLoading(true); setError('')
      try { const r = await library(await getToken(), searching || all ? 'all' : 'beds', q); if (!stop) setTracks(r) }
      catch (e) { if (!stop) { setError(errText(e)); setTracks([]) } }
      finally { if (!stop) setLoading(false) }
    }, searching ? 250 : 0)
    return () => { stop = true; clearTimeout(t) }
  }, [all, q, searching, getToken])

  useEffect(() => { savePref('musicVolume', String(volume)) }, [volume])
  // The dial glides to its new place so the music never jumps.
  useEffect(() => {
    const from = dial.current, t0 = performance.now()
    let raf = 0
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / GLIDE_MS)
      dial.current = from + (volume - from) * k
      apply()
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [volume, apply])

  /** Fades the current song's player to a level (0 to 1) over ms. A newer fade cancels this one. */
  const ramp = useCallback((to: number, ms: number) => new Promise<void>(done => {
    const id = ++fade.current, i = act.current, from = gain.current[i], t0 = performance.now()
    const step = () => {
      if (id !== fade.current) return done()
      const k = Math.min(1, (performance.now() - t0) / ms)
      gain.current[i] = from + (to - from) * k
      apply()
      if (k < 1) requestAnimationFrame(step); else done()
    }
    requestAnimationFrame(step)
  }), [apply])

  const announce = useCallback((t: Track) => {
    curRef.current = t; setCur(t)
    if (live && !t.ad && !t.stationId) onAired(t)
  }, [live, onAired])

  /** Starts a song with nothing else playing (or after the old one fades out quickly). */
  const fresh = useCallback(async (t: Track, opts: { loop?: boolean; fadeIn?: boolean } = {}) => {
    xfId.current++; xfBusy.current = false
    const other = decks.current[1 - act.current]
    if (other) { other.pause(); gain.current[1 - act.current] = 0 }
    const a = decks.current[act.current]
    if (!a) return
    if (!a.paused) { await ramp(0, 600); a.pause() }
    a.src = trackUrl(t.id, await getToken())
    a.loop = opts.loop ?? t.bed
    fade.current++
    gain.current[act.current] = opts.fadeIn === false ? 1 : 0; apply()
    await a.play()
    announce(t)
    if (opts.fadeIn !== false) void ramp(1, FADE_IN_MS)
  }, [ramp, getToken, apply, announce])

  /** The next song starts on the other player while this one fades out (equal power, so the loudness stays level). */
  const cross = useCallback(async (t: Track, ms: number) => {
    xfBusy.current = true
    const id = ++xfId.current, out = act.current, inn = 1 - out
    const oa = decks.current[out], ia = decks.current[inn]
    if (!oa || !ia) { xfBusy.current = false; return }
    fade.current++ // a single-player fade must not fight this one
    try {
      ia.pause()
      ia.src = trackUrl(t.id, await getToken())
      ia.loop = t.bed
      gain.current[inn] = 0; apply()
      await ia.play()
      if (id !== xfId.current) return
      act.current = inn
      announce(t); setPlaying(true)
      const t0 = performance.now()
      await new Promise<void>(done => {
        const step = () => {
          if (id !== xfId.current) return done()
          const k = Math.min(1, (performance.now() - t0) / ms), g = fadeGains(k)
          gain.current[out] = g.out; gain.current[inn] = g.in; apply()
          if (k < 1) requestAnimationFrame(step); else done()
        }
        requestAnimationFrame(step)
      })
      if (id === xfId.current) { oa.pause(); gain.current[out] = 0; gain.current[inn] = 1; apply() }
    } finally { if (id === xfId.current) xfBusy.current = false }
  }, [getToken, apply, announce])

  /** Plays a song now: a crossfade if something is playing and the fade is on, otherwise it fades in. */
  const play = useCallback(async (t: Track, opts: { loop?: boolean; fadeIn?: boolean; crossMs?: number } = {}) => {
    setError('')
    try {
      const a = decks.current[act.current]
      const running = !!a && !a.paused && !a.ended
      const ms = opts.crossMs ?? xfadeRef.current * 1000
      if (running && opts.fadeIn !== false && ms >= 300) await cross(t, ms)
      else await fresh(t, opts)
    } catch (e) { setError(e instanceof DOMException ? 'Could not play that track.' : errText(e)) }
  }, [cross, fresh])

  // One song ended by itself: an ad break goes first, then the queue.
  const advance = () => {
    const ad = adsRef.current.shift()
    if (ad) { void play(ad, { loop: false, fadeIn: false }); return }
    const next = queueRef.current[0]
    if (next) { setQueue(queueRef.current.slice(1)); void play(next, { loop: false, fadeIn: false }) }
  }
  // Near the end of a song with something queued, start the crossfade so it finishes as the song does.
  const check = (a: SinkAudio) => {
    const next = queueRef.current[0], c = curRef.current
    if (!next || xfBusy.current || a.loop || !c || c.ad || c.stationId || adsRef.current.length) return
    const lead = leadSeconds(a.duration, xfadeRef.current)
    const left = a.duration - a.currentTime
    if (lead > 0 && left <= lead) { setQueue(queueRef.current.slice(1)); void play(next, { crossMs: Math.max(300, left * 1000) }) }
  }
  const recover = async () => {
    const t = curRef.current, a = decks.current[act.current]
    if (!t || !a) return
    const at = a.currentTime
    try { a.src = trackUrl(t.id, await getToken()); a.currentTime = at; await a.play() } catch { setError('The music stopped. Press Play to try again.') }
  }

  useEffect(() => { api.current = { advance, check, recover } })

  const lastId = useRef(idCue), lastAd = useRef(adCue)
  useEffect(() => {
    if (idCue === lastId.current) return
    lastId.current = idCue
    ;(async () => {
      try {
        const ids = await library(await getToken(), 'ids')
        if (!ids.length) return setError('No station IDs in the library yet.')
        await play(ids[Math.floor(Math.random() * ids.length)], { loop: false, crossMs: ID_FADE_MS })
      } catch (e) { setError(errText(e)) }
    })()
  }, [idCue, getToken, play])
  useEffect(() => {
    if (adCue === lastAd.current) return
    lastAd.current = adCue
    ;(async () => {
      try {
        const ads = await library(await getToken(), 'ads')
        if (!ads.length) return setError('No ads in the library yet.')
        adsRef.current = ads.slice(1)
        await play(ads[0], { loop: false, fadeIn: false })
      } catch (e) { setError(errText(e)) }
    })()
  }, [adCue, getToken, play])

  const playPause = async () => {
    const a = decks.current[act.current]
    if (!a || !cur) return
    if (a.paused) { gain.current[act.current] = 0; apply(); await a.play().catch(() => {}); void ramp(1, FADE_IN_MS) }
    else { await ramp(0, 600); a.pause() }
  }
  const fadeOut = async () => {
    const a = decks.current[act.current]
    if (!a) return
    adsRef.current = []; xfId.current++; xfBusy.current = false
    const other = decks.current[1 - act.current]
    if (other) { other.pause(); gain.current[1 - act.current] = 0 }
    await ramp(0, FADE_OUT_MS); a.pause(); gain.current[act.current] = 1; apply()
  }
  /** Next: the next queued song crossfades in; with an empty queue the music fades out. */
  const skip = async () => {
    const next = queueRef.current[0]
    if (!next) { await fadeOut(); return }
    setQueue(queueRef.current.slice(1))
    await play(next, { crossMs: xfadeRef.current * 1000 })
  }

  // Taps. A tap that would queue waits a moment to see whether it is the first half of a double tap (play it now).
  const pending = useRef<{ t: Track; timer: ReturnType<typeof setTimeout> } | null>(null)
  const playingNow = useCallback(() => { const a = decks.current[act.current]; return a && !a.paused && curRef.current ? curRef.current : null }, [])
  const doTap = useCallback((t: Track, dbl: boolean) => {
    if (tapAction(playingNow(), t, dbl) === 'play') void play(t)
    else setQueue(enqueue(queueRef.current, t))
  }, [play, setQueue, playingNow])
  const onTap = (t: Track) => {
    const p = pending.current
    if (p && p.t.id === t.id) { clearTimeout(p.timer); pending.current = null; doTap(t, true); return }
    if (p) { clearTimeout(p.timer); pending.current = null; doTap(p.t, false) }
    if (tapAction(playingNow(), t, false) === 'play') { doTap(t, false); return }
    pending.current = { t, timer: setTimeout(() => { pending.current = null; doTap(t, false) }, TAP_WAIT_MS) }
  }
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer) }, [])

  useEffect(() => { onTrack?.(playing ? cur : null) }, [cur, playing, onTrack])
  // Listeners have no song to show while the music is stopped, or an ad or station ID is on.
  useEffect(() => { if (!playing || !cur || cur.ad || cur.stationId) onIdle?.() }, [playing, cur, onIdle])

  const pct = Math.round(volume * 100)
  const inQueue = (id: string) => queue.filter(t => t.id === id).length
  const qLen = queueSeconds(queue)
  return (
    <div className="g hf">
      <div className="eng h" style={{ left: 640, top: 64 }}>Background music</div>
      <Btn id="bedsbtn" on={view === 'lib' && !all && !searching} aria-pressed={view === 'lib' && !all && !searching} onClick={() => { setView('lib'); setAll(false); setQ('') }}>Beds</Btn>
      <Btn id="allbtn" on={view === 'lib' && all && !searching} aria-pressed={view === 'lib' && all && !searching} onClick={() => { setView('lib'); setAll(true); setQ('') }}>All</Btn>
      <div className="eng s" style={{ left: 886, top: 66 }}>Playing</div>
      <Led id="playled" c={playing ? 'green' : ''} />
      <div id="search" className="lw">
        <input value={q} onChange={e => { setQ(e.target.value); setView('lib') }} placeholder="Search songs or artists" autoComplete="off" spellCheck={false} aria-label="Search the library" />
      </div>

      <div id="tracks" className="lw">
        {view === 'queue' ? (
          <>
            <span className="px dim msg">{queue.length ? `Up next: ${queue.length} · ${mmss(qLen)}. Tap one to remove it.` : 'The queue is empty. Tap songs in the list to queue them, double tap to play now.'}</span>
            {queue.map((t, i) => (
              <button key={`${t.id}-${i}`} type="button" onClick={() => setQueue(removeAt(queueRef.current, i))} className="trow row" title="Remove from the queue">
                <span className="px n">{i + 1}. {t.title}{t.artist ? ` · ${t.artist}` : ''}</span>
                <span className="px dim">{mmss(t.length)}</span>
              </button>
            ))}
            {queue.length > 1 && <button type="button" className="trow row" onClick={() => setQueue([])}><span className="px n">Clear the queue</span></button>}
          </>
        ) : (
          <>
            {error && <span className="px org msg" role="alert">{error}</span>}
            {loading && !tracks?.length && <span className="px dim msg">Loading…</span>}
            {tracks?.length === 0 && !loading && !error && (
              <span className="px dim msg">{searching ? 'Nothing found.' : all ? 'The library is empty.' : 'No beds yet. Add tracks to a “Beds” playlist.'}</span>
            )}
            {tracks?.map(t => {
              const on = cur?.id === t.id, nq = inQueue(t.id)
              return (
                <button key={t.id} type="button" onClick={() => onTap(t)} className={`trow row ${on ? 'sel' : ''}`}>
                  <span className="px n">{on && playing ? '> ' : ''}{nq ? `[${nq}] ` : ''}{t.title}{t.artist ? ` · ${t.artist}` : ''}</span>
                  <span className="px dim">{on && playing ? `-${mmss(Math.max(0, dur - pos))}` : mmss(t.length)}</span>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* The dial sets the music's volume only (tracks, not the mics). */}
      <Knob id="music" label="Music" value={volume} min={0} max={1} text={`${pct}%`} onChange={setVolume} />
      <Btn id="qbtn" on={view === 'queue'} aria-pressed={view === 'queue'} onClick={() => setView(v => (v === 'queue' ? 'lib' : 'queue'))} title="Show the queue">Queue{queue.length ? ` (${queue.length})` : ''}</Btn>
      <Btn id="nextbtn" onClick={skip} disabled={!playing} title={queue.length ? 'Crossfade into the next queued song' : 'Nothing queued: fade out'}>Next</Btn>
      <Btn id="tplay" onClick={playPause} disabled={!cur} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}><Ic n={playing ? 'pause' : 'play'} /></Btn>
      <Btn id="tfade" onClick={fadeOut} disabled={!playing}>Fade out</Btn>
      <Btn id="xfbtn" onClick={() => setXfade(nextXfade)} title="How long one song blends into the next (tap to change)">{xfade ? `Fade ${xfade} s` : 'Fade off'}</Btn>
      <Btn id="modebtn" on={mode === 'music'} aria-pressed={mode === 'music'} onClick={() => onMode(mode === 'music' ? 'talk' : 'music')}
           title={mode === 'music' ? 'Music show: listeners see the song large' : 'Talk show: listeners see a small now-playing line'}>{mode === 'music' ? 'Music show' : 'Talk show'}</Btn>
    </div>
  )
}
