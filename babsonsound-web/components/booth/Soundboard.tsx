'use client'

import { useEffect, useRef, useState } from 'react'
import { errText, library, trackUrl, type Track } from './helper'

// A 3 × 3 sound board: station IDs, jingles and sound effects ("Soundboard", "Jingles", "Station IDs" playlists).
// Tap a pad (or press 1–9) to fire it over everything on the music output; tap again to stop it.

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
const PADS = 9

export default function Soundboard({ getToken, output }: { getToken: () => Promise<string>; output: string }) {
  const audio = useRef<SinkAudio | null>(null)
  const [pads, setPads] = useState<Track[] | null>(null)
  const [on, setOn] = useState('')
  const [left, setLeft] = useState(1)
  const [error, setError] = useState('')

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
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <p className="hw-title text-3xl leading-tight">Sound board</p>
      <div className="grid grid-cols-3 grid-rows-3 gap-3 flex-1 min-h-0">
        {slots.map((t, i) => (
          <button key={t?.id ?? `empty-${i}`} type="button" className="gpad" disabled={!t} aria-pressed={!!t && on === t.id} onClick={() => t && hit(t)}>
            <span className="n">{i + 1}</span>
            <span className="t">{t?.title ?? ''}</span>
            {t && on === t.id && <span className="run" style={{ width: `${left * 100}%` }} />}
          </button>
        ))}
      </div>
      {(error || (pads && !pads.length)) && <p className="lbl text-lg">{error || 'Add jingles and IDs to a “Soundboard” playlist to fill the pads.'}</p>}
    </div>
  )
}
