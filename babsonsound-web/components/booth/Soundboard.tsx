'use client'

import { useEffect, useRef, useState } from 'react'
import { errText, library, loadPref, savePref, trackUrl, type Track } from './helper'
import { Knob } from './es2/Stage'

// 8 sound pads (two rows of four): station IDs, jingles and sound effects ("Soundboard", "Jingles", "Station IDs" playlists).
// Tap a pad (or press 1–8) to fire it over everything on the music output; tap again to stop it. The Effects dial sets how loud the pads are.

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
const PADS = 8

export default function Soundboard({ getToken, output }: { getToken: () => Promise<string>; output: string }) {
  const audio = useRef<SinkAudio | null>(null)
  const [pads, setPads] = useState<Track[] | null>(null)
  const [on, setOn] = useState('')
  const [left, setLeft] = useState(1)
  const [error, setError] = useState('')
  const [volume, setVolume] = useState(() => { const v = Number(loadPref('padVolume', '1')); return v >= 0 && v <= 1 ? v : 1 })
  useEffect(() => { if (audio.current) audio.current.volume = volume; savePref('padVolume', String(volume)) }, [volume])

  useEffect(() => {
    const a = new Audio() as SinkAudio
    a.crossOrigin = 'anonymous'
    a.addEventListener('ended', () => setOn(''))
    a.addEventListener('timeupdate', () => setLeft(a.duration ? 1 - a.currentTime / a.duration : 1))
    audio.current = a
    return () => { a.pause(); a.src = '' }
  }, [])
  useEffect(() => { audio.current?.setSinkId?.(output).catch(() => {}) }, [output])
  useEffect(() => {
    let stop = false
    ;(async () => {
      try { const t = await library(await getToken(), 'pads'); if (!stop) setPads(t.slice(0, PADS)) }
      catch (e) { if (!stop) { setError(errText(e)); setPads([]) } }
    })()
    return () => { stop = true }
  }, [getToken])

  const hitRef = useRef<(t: Track) => void>(() => {})
  const hit = async (t: Track) => {
    const a = audio.current
    if (!a) return
    if (on === t.id) { a.pause(); setOn(''); return }
    try { a.src = trackUrl(t.id, await getToken()); a.currentTime = 0; setLeft(1); await a.play(); setOn(t.id) } catch { setError('Could not play that sound.') }
  }
  useEffect(() => { hitRef.current = hit })

  // Keys 1–9 fire the pads (not while typing in a box).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const n = Number(e.key)
      const t = n >= 1 && n <= PADS ? pads?.[n - 1] : undefined
      if (t) { e.preventDefault(); hitRef.current(t) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [pads])

  const slots = Array.from({ length: PADS }, (_, i) => pads?.[i] ?? null)
  const note = error || (pads && !pads.length ? 'Add jingles to a “Soundboard” playlist' : '')
  return (
    <div className="g hf">
      <div className="eng h" style={{ left: 640, top: 312 }}>Sound board</div>
      <div className={`eng s ${error ? 'warn' : ''}`} style={{ right: -936, top: 314 }}>{note || 'Tap a pad, or press 1 to 8'}</div>
      <Knob id="sfx" label="Effects" value={volume} min={0} max={1} text={`${Math.round(volume * 100)}%`} onChange={setVolume} />
      <div id="pads" className="lw">
        {slots.map((t, i) => (
          <button key={t?.id ?? `empty-${i}`} type="button" className={`pd px ${t && on === t.id ? 'on' : ''}`} disabled={!t} aria-pressed={!!t && on === t.id} onClick={() => t && hit(t)}>
            <i>0{i + 1}</i>
            <b>{t?.title ?? ''}</b>
            {t && on === t.id && <u style={{ width: `${left * 100}%` }} />}
          </button>
        ))}
      </div>
    </div>
  )
}
