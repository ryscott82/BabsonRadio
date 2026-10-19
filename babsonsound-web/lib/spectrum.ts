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

interface Tap { ctx: AudioContext; an: AnalyserNode; data: Uint8Array<ArrayBuffer>; gain: GainNode; shaper: WaveShaperNode; shaped: boolean }
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
    an.fftSize = 2048; an.smoothingTimeConstant = 0.7; an.minDecibels = -88; an.maxDecibels = -22
    const src = ctx.createMediaElementSource(el)
    src.connect(an) // analyser is a side branch; the sound itself goes src -> gain -> speakers
    const gain = ctx.createGain(), shaper = ctx.createWaveShaper()
    shaper.curve = softClipCurve(); shaper.oversample = '2x'
    src.connect(gain); gain.connect(ctx.destination)
    const tap: Tap = { ctx, an, data: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)), gain, shaper, shaped: false }
    taps.set(el, tap); current = tap
    setBoostDb(boostDb)
    return true
  } catch { return false }
}
// Volume boost past the element's 100%: a gain stage, plus a soft clipper that only engages while boosting, so peaks
// round off instead of cracking. (Transparent below 80% of full scale; a bypass keeps normal listening untouched.)
let boostDb = 0
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048, c = new Float32Array(new ArrayBuffer(n * 4)), k = 0.8
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x)
    c[i] = a <= k ? x : Math.sign(x) * (k + (1 - k) * Math.tanh((a - k) / (1 - k)))
  }
  return c
}
/** 0 = normal. Positive values boost by that many dB. Safe to call before the audio is attached; it applies on attach. */
export function setBoostDb(db: number) {
  boostDb = Math.max(0, db)
  const t = current
  if (!t) return
  t.gain.gain.value = Math.pow(10, boostDb / 20)
  const on = boostDb > 0.05
  if (on !== t.shaped) {
    t.gain.disconnect()
    if (on) { t.gain.connect(t.shaper); t.shaper.connect(t.ctx.destination) } else { t.shaper.disconnect(); t.gain.connect(t.ctx.destination) }
    t.shaped = on
  }
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
    out[i] = Math.min(1, v * (1 + 0.9 * (i / n))) // highs are quieter in music, so lift them a little
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
    const lv = new Array(bars.length).fill(0), pk = new Array(bars.length).fill(0), hold = new Array(bars.length).fill(0)
    let raf = 0, quiet = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const ok = readBands(lv)
      if (!ok) { quiet++; if (quiet > 180) box.dataset.real = 'false'; return }
      quiet = 0; box.dataset.real = 'true'
      for (let i = 0; i < bars.length; i++) {
        const segs = Math.round(lv[i] * segments)
        if (segs >= pk[i]) { pk[i] = segs; hold[i] = 24 } else if (hold[i]-- <= 0) pk[i] = Math.max(0, pk[i] - 0.15)
        bars[i].style.setProperty('--lv', String(segs / segments))
        bars[i].style.setProperty('--pk', String(Math.min(segments, Math.round(pk[i])) / segments))
        bars[i].dataset.hot = pk[i] >= segments - 1 ? '1' : '0'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); box.dataset.real = 'false' }
  }, [ref, playing, segments])
}
