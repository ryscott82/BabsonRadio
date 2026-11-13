'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { errText, library, loadPref, mmss, savePref, trackUrl, type Track } from './helper'

// Tracks from the station's library (through the studio helper): beds for talk shows, or search the whole library.
// Tap a track to play it (it fades in). Talk over dips the music under voices. The fader sets the music's volume only.
// Also plays a station ID (from the clock) and the ad break (the Ads playlist, one after another).

const DUCK = 0.22
const FADE_IN_MS = 1500, FADE_OUT_MS = 3000, GLIDE_MS = 400

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }

export default function MusicPlayer({ getToken, live, output, idCue, adCue, onAired, onTrack, listSlot }: {
  getToken: () => Promise<string>
  live: boolean
  output: string
  idCue: number
  adCue: number
  /** A track started on air while live (for the play log). */
  onAired: (t: Track) => void
  /** The track that is playing now (null when nothing plays). */
  onTrack?: (t: Track | null) => void
  /** Shown instead of the search box and track list (the sign-in info while nobody is signed in). */
  listSlot?: React.ReactNode
}) {
  const main = useRef<SinkAudio | null>(null)
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cur, setCur] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [volume, setVolume] = useState(() => Number(loadPref('musicVolume', '0.6')) || 0.6)
  const [ducked, setDucked] = useState(false)
  const fade = useRef(0), mult = useRef(1)
  const curRef = useRef<Track | null>(null)
  const queue = useRef<Track[]>([])

  useEffect(() => {
    const a = new Audio() as SinkAudio
    a.crossOrigin = 'anonymous'; a.preload = 'auto'
    main.current = a
    const time = () => { setPos(a.currentTime); setDur(Number.isFinite(a.duration) ? a.duration : 0) }
    a.addEventListener('timeupdate', time); a.addEventListener('loadedmetadata', time)
    a.addEventListener('play', () => setPlaying(true)); a.addEventListener('pause', () => setPlaying(false))
    return () => { a.pause(); a.src = '' }
  }, [])
  useEffect(() => { main.current?.setSinkId?.(output).catch(() => setError('Could not use that music output.')) }, [output])

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

  const target = useCallback(() => volume * (ducked ? DUCK : 1), [volume, ducked])
  const apply = useCallback(() => { if (main.current) main.current.volume = Math.max(0, Math.min(1, target() * mult.current)) }, [target])
  useEffect(() => { savePref('musicVolume', String(volume)) }, [volume])

  const ramp = useCallback((to: number, ms: number) => new Promise<void>(done => {
    const id = ++fade.current, from = mult.current, t0 = performance.now()
    const step = () => {
      if (id !== fade.current) return done()
      const k = Math.min(1, (performance.now() - t0) / ms)
      mult.current = from + (to - from) * k
      apply()
      if (k < 1) requestAnimationFrame(step); else done()
    }
    requestAnimationFrame(step)
  }), [apply])

  useEffect(() => {
    const a = main.current
    if (!a) return
    const from = a.volume, to = target() * mult.current, t0 = performance.now()
    let raf = 0
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / GLIDE_MS)
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const start = useCallback(async (t: Track, opts: { loop?: boolean; fadeIn?: boolean } = {}) => {
    const a = main.current
    if (!a) return
    setError('')
    try {
      if (!a.paused) { await ramp(0, 600); a.pause() }
      a.src = trackUrl(t.id, await getToken())
      a.loop = opts.loop ?? t.bed
      mult.current = opts.fadeIn === false ? 1 : 0; apply()
      await a.play()
      curRef.current = t; setCur(t)
      if (opts.fadeIn !== false) ramp(1, FADE_IN_MS)
      if (live && !t.ad && !t.stationId) onAired(t)
    } catch (e) { setError(e instanceof DOMException ? 'Could not play that track.' : errText(e)) }
  }, [ramp, getToken, apply, live, onAired])

  useEffect(() => {
    const a = main.current
    if (!a) return
    const ended = () => { mult.current = 1; const next = queue.current.shift(); if (next) start(next, { loop: false, fadeIn: false }) }
    a.addEventListener('ended', ended)
    return () => a.removeEventListener('ended', ended)
  }, [start])

  useEffect(() => {
    const a = main.current
    if (!a) return
    const onErr = async () => {
      const t = curRef.current
      if (!t) return
      const at = a.currentTime
      try { a.src = trackUrl(t.id, await getToken()); a.currentTime = at; await a.play() } catch { setError('The music stopped. Press Play to try again.') }
    }
    a.addEventListener('error', onErr)
    return () => a.removeEventListener('error', onErr)
  }, [getToken])

  const lastId = useRef(idCue), lastAd = useRef(adCue)
  useEffect(() => {
    if (idCue === lastId.current) return
    lastId.current = idCue
    ;(async () => {
      try {
        const ids = await library(await getToken(), 'ids')
        if (!ids.length) return setError('No station IDs in the library yet.')
        await start(ids[Math.floor(Math.random() * ids.length)], { loop: false })
      } catch (e) { setError(errText(e)) }
    })()
  }, [idCue, getToken, start])
  useEffect(() => {
    if (adCue === lastAd.current) return
    lastAd.current = adCue
    ;(async () => {
      try {
        const ads = await library(await getToken(), 'ads')
        if (!ads.length) return setError('No ads in the library yet.')
        queue.current = ads.slice(1)
        await start(ads[0], { loop: false, fadeIn: false })
      } catch (e) { setError(errText(e)) }
    })()
  }, [adCue, getToken, start])

  const playPause = async () => {
    const a = main.current
    if (!a || !cur) return
    if (a.paused) { mult.current = 0; apply(); await a.play().catch(() => {}); ramp(1, FADE_IN_MS) }
    else { await ramp(0, 600); a.pause() }
  }
  const fadeOut = async () => { const a = main.current; if (!a) return; queue.current = []; await ramp(0, FADE_OUT_MS); a.pause(); mult.current = 1 }

  useEffect(() => { onTrack?.(playing ? cur : null) }, [cur, playing, onTrack])
  const pct = Math.round(volume * 100)
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {listSlot ?? (
        <>
      <div className="flex items-center gap-3">
        <p className="hw-title text-3xl leading-tight mr-1">Tracks</p>
        <button type="button" className="gbtn h-11 px-4 text-lg" aria-pressed={!all && !searching} onClick={() => { setAll(false); setQ('') }}>Beds</button>
        <button type="button" className="gbtn h-11 px-4 text-lg" aria-pressed={all && !searching} onClick={() => { setAll(true); setQ('') }}>All</button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search songs or artists" autoComplete="off" aria-label="Search the library"
               className="gfield h-11 px-4 text-lg flex-1 min-w-0" />
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-[rgba(244,239,226,.1)] divide-y divide-[rgba(244,239,226,.08)]">
        {loading && !tracks?.length && <li className="lbl text-lg px-4 py-3">Loading…</li>}
        {tracks?.length === 0 && !loading && !error && (
          <li className="lbl text-lg px-4 py-3">{searching ? 'Nothing found.' : all ? 'The library is empty.' : 'No beds yet. Add tracks to a “Beds” playlist.'}</li>
        )}
        {tracks?.map(t => {
          const on = cur?.id === t.id
          return (
            <li key={t.id}>
              <button type="button" onClick={() => start(t)} className={`w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-white/5 ${on ? 'bg-[rgba(31,191,127,.14)]' : ''}`}>
                <span className={`w-5 shrink-0 text-lg ${on ? 'ok' : 'lbl'}`}>{on && playing ? '▶' : ''}</span>
                <span className="min-w-0 flex-1 truncate text-lg">{t.title}{t.artist && <span className="lbl"> · {t.artist}</span>}</span>
                <span className="lbl text-lg tabular-nums shrink-0">{on && playing ? `-${mmss(Math.max(0, dur - pos))}` : mmss(t.length)}</span>
              </button>
            </li>
          )
        })}
      </ul>
        </>
      )}
      {error && <p className="warn text-lg">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" className="gbtn h-12 w-28 text-xl" onClick={playPause} disabled={!cur}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" className="gbtn h-12 px-5 text-xl" onClick={fadeOut} disabled={!playing}>Fade out</button>
        <button type="button" className="gbtn h-12 px-5 text-xl" onClick={() => setDucked(d => !d)} aria-pressed={ducked}>Talk over</button>
        <span className="lbl text-lg truncate min-w-0">{cur ? cur.title : 'Tap a track to play it'}</span>
      </div>
      <label className="flex items-center gap-4">
        <span className="text-xl shrink-0">Music volume</span>
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))}
               className="gfader flex-1" style={{ ['--v' as string]: `${pct}%` }} aria-label="Music volume (tracks only, not the mics)" />
        <span className="num text-3xl w-16 text-right">{pct}%</span>
      </label>
    </div>
  )
}
