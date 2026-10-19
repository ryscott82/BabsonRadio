'use client'

import { useEffect, type RefObject } from 'react'

// Real equalizer: reads the playing stream through a Web Audio analyser and drives the LED bars from it.
// The browser only lets a page analyse a stream whose server allows cross-origin reads (Access-Control-Allow-Origin).
// probeCors() checks that once; without it we leave the audio element alone (so playback is never at risk) and the bars
// fall back to the synthetic motion in CSS.

let corsProbe: Promise<boolean> | null = null
export function probeCors(url: string): Promise<boolean> {
  if (!url) return Promise.resolve(false)
  if (!corsProbe) {
    corsProbe = (async () => {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 6000)
      try { await fetch(url, { method: 'HEAD', mode: 'cors', cache: 'no-store', signal: ctl.signal }); return true } catch { return false } finally { clearTimeout(t) }
    })()
  }
  return corsProbe
}

interface Tap { ctx: AudioContext; an: AnalyserNode; data: Uint8Array<ArrayBuffer>; direct: GainNode; dry: GainNode; drive: GainNode; wet: GainNode }
const taps = new WeakMap<HTMLAudioElement, Tap>()
let current: Tap | null = null

/** Routes the element through an analyser (the element must already have crossOrigin='anonymous'). Safe to call twice. */
export function attachSpectrum(el: HTMLAudioElement): boolean {
  const have = taps.get(el)
  if (have) { current = have; return true }
  try {
    const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const an = ctx.createAnalyser()
    an.fftSize = 2048; an.smoothingTimeConstant = 0.5; an.minDecibels = -90; an.maxDecibels = -6
    const src = ctx.createMediaElementSource(el)
    src.connect(an) // analyser is a side branch; the sound itself goes src -> gain -> speakers
    // Sound path: src -> direct -> speakers while the knob is at or below 100% (untouched). Past 100% the sound goes through
    // dry + a saturated copy (drive -> tube-style shaper -> wet), summed and rounded off by a soft clipper.
    const direct = ctx.createGain(), dry = ctx.createGain(), drive = ctx.createGain(), wet = ctx.createGain()
    const sat = ctx.createWaveShaper(), clip = ctx.createWaveShaper(), bus = ctx.createGain()
    sat.curve = tubeCurve(); sat.oversample = '4x'
    clip.curve = softClipCurve(); clip.oversample = '2x'
    dry.gain.value = 0; wet.gain.value = 0; drive.gain.value = 1; bus.gain.value = 0.9
    src.connect(direct); direct.connect(ctx.destination)
    src.connect(dry); dry.connect(bus)
    src.connect(drive); drive.connect(sat); sat.connect(wet); wet.connect(bus)
    bus.connect(clip); clip.connect(ctx.destination)
    const tap: Tap = { ctx, an, data: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)), direct, dry, drive, wet }
    taps.set(el, tap); current = tap
    setBoostDb(boostDb)
    return true
  } catch { return false }
}
// Past 100% the knob adds drive: louder, and increasingly saturated (warm, tube-like crunch, some even harmonics), with a
// soft clipper at the end so peaks round off instead of cracking. Below 100% nothing is in the signal path but the element.
let boostDb = 0
const MAX_BOOST_DB = 6
function tubeCurve(): Float32Array<ArrayBuffer> {
  const n = 4096, c = new Float32Array(new ArrayBuffer(n * 4)), bias = 0.18, k = 1.3
  const norm = Math.tanh(k + bias) - Math.tanh(bias)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = (Math.tanh(k * x + bias) - Math.tanh(bias)) / norm } // slightly lopsided, so it adds even harmonics like a tube stage
  return c
}
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048, c = new Float32Array(new ArrayBuffer(n * 4)), k = 0.8
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x)
    c[i] = a <= k ? x : Math.sign(x) * (k + (1 - k) * Math.tanh((a - k) / (1 - k)))
  }
  return c
}
/** 0 = normal. Positive values add drive (the knob's boost zone, in dB). Safe to call before the audio is attached; it applies on attach. */
export function setBoostDb(db: number) {
  boostDb = Math.max(0, db)
  const t = current
  if (!t) return
  const on = boostDb > 0.05, k = Math.min(1, boostDb / MAX_BOOST_DB), now = t.ctx.currentTime, glide = 0.03
  t.direct.gain.setTargetAtTime(on ? 0 : 1, now, glide)
  t.dry.gain.setTargetAtTime(on ? Math.pow(10, boostDb / 20) * (1 - 0.85 * k) : 0, now, glide)
  t.drive.gain.setTargetAtTime(1 + 7 * k, now, glide)
  t.wet.gain.setTargetAtTime(on ? 0.75 * k : 0, now, glide)
}

/** Call from a click/tap handler: browsers keep the audio context asleep until then. */
export function wakeSpectrum() { current?.ctx.resume().catch(() => {}) }

/** Fills `out` with 0..1 levels, log-spaced from about 50 Hz to 15 kHz. Returns false while there is nothing to read. */
function readBands(out: number[]): boolean {
  if (!current) return false
  const { an, data, ctx } = current
  an.getByteFrequencyData(data)
  const n = out.length, hz = ctx.sampleRate / an.fftSize
  let any = 0
  for (let i = 0; i < n; i++) {
    const lo = Math.max(1, Math.floor((50 * Math.pow(300, i / n)) / hz))
    const hi = Math.max(lo + 1, Math.ceil((50 * Math.pow(300, (i + 1) / n)) / hz))
    let sum = 0
    for (let k = lo; k < hi && k < data.length; k++) sum += data[k]
    const v = sum / (hi - lo) / 255
    any += v
    out[i] = Math.min(1, v * (1 + 0.35 * (i / n))) // a mild lift for the quieter highs; shaping happens in the caller
  }
  return any > 0.01
}

/**
 * Drives the LED bars inside `ref` (children <i>) while `playing`: sets --lv (lit height, snapped to whole segments)
 * and --pk (peak cap) on each, and marks the container data-real="true" once real audio is flowing.
 */
export function useLedSpectrum(ref: RefObject<HTMLElement | null>, playing: boolean, segments = 7) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const bars = Array.from(box.children) as HTMLElement[]
    if (!playing || !bars.length) { box.dataset.real = 'false'; return }
    const N = bars.length
    const lv = new Array(N).fill(0), pk = new Array(N).fill(0), hold = new Array(N).fill(0)
    const avg = new Array(N).fill(0), shown = new Array(N).fill(0)
    let raf = 0, quiet = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const ok = readBands(lv)
      if (!ok) { quiet++; if (quiet > 180) box.dataset.real = 'false'; return }
      quiet = 0; box.dataset.real = 'true'
      for (let i = 0; i < N; i++) {
        // Each band is judged against its own recent average: sustained energy settles to mid-height and only hits jump above it,
        // lulls drop below it. Rise is instant; the fall is fast (about a tenth of a second), so nothing stays stuck on top.
        const raw = lv[i]
        avg[i] += (raw - avg[i]) * 0.04
        const target = Math.max(0, Math.min(1, Math.pow(raw, 1.5) * 0.6 + (raw - avg[i]) * 2.6 + 0.04))
        shown[i] = Math.max(target, shown[i] * 0.7)
        const segs = Math.round(shown[i] * segments)
        if (segs >= pk[i]) { pk[i] = segs; hold[i] = 20 } else if (hold[i]-- <= 0) pk[i] = Math.max(0, pk[i] - 0.2)
        bars[i].style.setProperty('--lv', String(segs / segments))
        bars[i].style.setProperty('--pk', String(Math.min(segments, Math.round(pk[i])) / segments))
        bars[i].dataset.hot = pk[i] >= segments - 1 ? '1' : '0'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); box.dataset.real = 'false' }
  }, [ref, playing, segments])
}
