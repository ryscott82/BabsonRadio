'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { BACK_SEC, FORWARD_SEC, clampTime, episodeLink, fmtTime, nextSpeed, positionKey, resumeAt, speedLabel } from '@/lib/episodePlayer'

export interface PlayerEp { id: string; title: string; showName: string; thumbnailURL: string; duration: number }

/**
 * The player for a recorded show (audio episodes, played straight from AzuraCast): the show's picture or the Babson Radio logo, play and pause,
 * 15 seconds back, 30 forward, a seek bar, speed, and a Share button that copies the episode's link (optionally starting at the current time).
 * It remembers where each listener stopped, on that device only. startAt (from ?t= in a shared link) wins over the remembered place.
 */
export default function EpisodePlayer({ ep, startAt = 0, autoPlay = false }: { ep: PlayerEp; startAt?: number; autoPlay?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [len, setLen] = useState(ep.duration)
  const [speed, setSpeed] = useState(1)
  const [withTime, setWithTime] = useState(false)
  const [copied, setCopied] = useState('')
  const lastSaved = useRef(0)

  useEffect(() => {
    let off = false
    apiGet<{ url: string }>(`/api/episodes/${encodeURIComponent(ep.id)}/audio`).then(r => { if (!off) setUrl(r.url) }).catch(e => { if (!off) setErr((e as Error).message) })
    return () => { off = true }
  }, [ep.id])

  const onLoaded = useCallback(() => {
    const a = audio.current; if (!a) return
    const d = Number.isFinite(a.duration) ? a.duration : ep.duration
    setLen(d)
    let at = startAt
    if (!at) { try { at = resumeAt(Number(localStorage.getItem(positionKey(ep.id))), d) } catch { /* no storage: start at 0 */ } }
    if (at > 0) { a.currentTime = clampTime(at, d); setCur(a.currentTime) }
    if (autoPlay) a.play().catch(() => {}) // a browser may refuse to start by itself; the Play button then does it
  }, [ep.id, ep.duration, startAt, autoPlay])

  function remember(t: number) {
    if (Math.abs(t - lastSaved.current) < 5) return
    lastSaved.current = t
    try { localStorage.setItem(positionKey(ep.id), String(Math.floor(t))) } catch { /* private window: nothing remembered */ }
  }
  const seek = (t: number) => { const a = audio.current; if (!a) return; a.currentTime = clampTime(t, len); setCur(a.currentTime) }
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().catch(() => setErr('Your browser could not play this.')); else a.pause() }
  const cycleSpeed = () => { const s = nextSpeed(speed); setSpeed(s); if (audio.current) audio.current.playbackRate = s }

  async function share() {
    const link = episodeLink(window.location.origin, ep.id, withTime ? cur : 0)
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: ep.title, url: link }); return }
      await navigator.clipboard.writeText(link)
      setCopied('Link copied')
    } catch { setCopied(link) } // the address is shown so it can be copied by hand
    setTimeout(() => setCopied(''), 4000)
  }

  const btn = 'sk-key rounded-lg min-h-11 min-w-11 px-3 text-sm font-display tracking-widest text-br-dk-text disabled:opacity-50'
  return (
    <div className="bg-black/60 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-[#1B1B18]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {ep.thumbnailURL ? <img src={ep.thumbnailURL} alt="" className="absolute inset-0 w-full h-full object-cover" /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/beaver.png" alt="Babson Radio" className={ep.thumbnailURL ? 'absolute right-1 bottom-1 w-7 h-7 sm:w-9 sm:h-9 drop-shadow' : 'absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-contain'} />
        </div>
        <div className="min-w-0">
          <p className="text-br-dk-text text-base sm:text-lg line-clamp-2">{ep.title}</p>
          {ep.showName && ep.showName !== ep.title && <p className="text-sm text-br-dk-sub truncate">{ep.showName}</p>}
          <p className="text-xs text-br-dk-sub mt-1">Babson Radio</p>
        </div>
      </div>

      {err ? <p role="alert" className="text-sm text-red-400">{err}</p> : !url ? <p className="text-sm text-br-dk-sub">Loading…</p> : (
        <>
          <audio ref={audio} src={url} preload="metadata" onLoadedMetadata={onLoaded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                 onTimeUpdate={e => { setCur(e.currentTarget.currentTime); remember(e.currentTarget.currentTime) }} onEnded={() => { setPlaying(false); try { localStorage.removeItem(positionKey(ep.id)) } catch { /* nothing remembered */ } }}
                 onError={() => setErr('This recording could not be played. Try again in a moment.')} />
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-br-dk-sub w-14 text-right">{fmtTime(cur)}</span>
            <input type="range" aria-label="Seek" min={0} max={Math.max(1, Math.floor(len))} step={1} value={Math.min(Math.floor(cur), Math.max(1, Math.floor(len)))}
                   onChange={e => seek(Number(e.target.value))} className="flex-1 min-h-11 accent-[#c9a24a]" />
            <span className="text-xs tabular-nums text-br-dk-sub w-14">{fmtTime(len)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" className={btn} onClick={() => seek(cur - BACK_SEC)} aria-label={`Back ${BACK_SEC} seconds`}>⟲ {BACK_SEC}</button>
            <button type="button" className={`${btn} min-w-16 text-br-gold`} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
            <button type="button" className={btn} onClick={() => seek(cur + FORWARD_SEC)} aria-label={`Forward ${FORWARD_SEC} seconds`}>{FORWARD_SEC} ⟳</button>
            <button type="button" className={btn} onClick={cycleSpeed} aria-label={`Speed ${speedLabel(speed)}, change`}>{speedLabel(speed)}</button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-br-dk-sub">
            <button type="button" className={btn} onClick={share}>Share</button>
            <label className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={withTime} onChange={e => setWithTime(e.target.checked)} /> Start at {fmtTime(cur)}</label>
            <span role="status" aria-live="polite" className="text-br-gold break-all">{copied}</span>
          </div>
        </>
      )}
    </div>
  )
}
