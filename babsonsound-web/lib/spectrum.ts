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
export function readBands(out: number[]): boolean {
  if (!current) return false
  const { an, data, ctx } = current
  an.getByteFrequencyData(data)
  const n = out.length, hz = ctx.sampleRate / an.fftSize
  let any = 0
  // Bands are spread unevenly: the lows and highs get more of them (finer detail), the crowded mids are squeezed into a few,
  // (the shaper below keeps the mids from sitting high).
  const warp = (u: number) => u - (0.35 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI)
  for (let i = 0; i < n; i++) {
    const g0 = warp(i / n), g1 = warp((i + 1) / n)
    const lo = Math.max(1, Math.floor((50 * Math.pow(300, g0)) / hz))
    const hi = Math.max(lo + 1, Math.ceil((50 * Math.pow(300, g1)) / hz))
    let sum = 0
    for (let k = lo; k < hi && k < data.length; k++) sum += data[k]
    const v = sum / (hi - lo) / 255
    any += v
    out[i] = Math.min(1, v * (1 + 0.5 * ((i + 0.5) / n))) // lift the quieter highs; the shaper below does the rest
  }
  return any > 0.01
}

// The player registers its audio element so the visuals can tell whether anything is playing (the element is never in the page).
let player: HTMLAudioElement | null = null
export function registerAudio(el: HTMLAudioElement | null) { player = el }
export const audioPlaying = () => !!player && !player.paused && !player.ended

/**
 * Turns raw band levels into what the eyes should see, so the display dances instead of sitting still:
 *  - auto gain: every band is scaled between its own recent floor and ceiling, so quiet and loud tracks both fill the display;
 *  - lows and highs show their level; the mids (voice and melody) show how much each band stands out from its neighbours, and hold notes a little longer;
 *  - the attack follows how hard a band hit: loud bursts shoot up at once, soft or steady sound creeps;
 *  - a kick (a sudden jump in the lowest bands) flashes every band a little (`flash`, 0..1);
 *  - silence drops everything to the floor within about a tenth of a second.
 * Call the returned function once per frame with the raw 0..1 levels; it returns `shown` (0..1 per band) and `flash`.
 */
export function makeShaper(n: number) {
  const avg = new Array<number>(n).fill(0), lo = new Array<number>(n).fill(0), hi = new Array<number>(n).fill(0.2), shown = new Array<number>(n).fill(0)
  let flash = 0, kickAvg = 0, cool = 0
  return (raw: number[]) => {
    let mean = 0
    for (let i = 0; i < n; i++) mean += raw[i]
    mean /= n
    const quiet = mean < 0.03
    const kr = n > 1 ? (raw[0] + raw[1]) / 2 : raw[0]
    kickAvg += (kr - kickAvg) * 0.05
    if (cool > 0) cool--
    if (!quiet && cool === 0 && kr - kickAvg > 0.1 && kr > 0.22) { flash = 1; cool = 8 }
    flash *= 0.86
    const gs = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const r = raw[i]
      hi[i] = r > hi[i] ? r : hi[i] + (r - hi[i]) * 0.004 // ceiling: up at once, down over a few seconds
      lo[i] = r < lo[i] ? r : lo[i] + (r - lo[i]) * 0.002
      gs[i] = Math.max(0, Math.min(1, (r - lo[i]) / Math.max(0.12, hi[i] - lo[i])))
    }
    for (let i = 0; i < n; i++) {
      const mid = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 2) // 0 at the ends, 1 in the middle
      // Mids (voice and melody): judge each band against its neighbours, so sung notes and instrument lines stand out of the
      // broadband wash that drums make, and let a held note hold; lows and highs just show level.
      const nb = ((gs[Math.max(0, i - 1)] + gs[Math.min(n - 1, i + 1)]) / 2)
      const g = gs[i] * (1 - 0.75 * mid) + Math.max(0, Math.min(1, (gs[i] - nb) * 2.2 + gs[i] * 0.45)) * 0.75 * mid
      avg[i] += (g - avg[i]) * 0.05
      const burst = Math.max(0, g - avg[i])
      const target0 = Math.pow(g, 1.4) * 0.62 + burst * 1.4
      const target = quiet ? 0.02 : Math.min(1, target0 + flash * 0.22)
      const atk = Math.min(1, 0.08 + burst * 7 + mid * 0.25)
      shown[i] = target > shown[i] ? shown[i] + (target - shown[i]) * atk : Math.max(target, shown[i] * (quiet ? 0.45 : 0.7 + 0.14 * mid))
    }
    return { shown, flash }
  }
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
    const lv = new Array<number>(N).fill(0), pk = new Array<number>(N).fill(0), hold = new Array<number>(N).fill(0)
    const shape = makeShaper(N)
    let raf = 0, quiet = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const ok = readBands(lv)
      if (!ok) { quiet++; if (quiet > 180) box.dataset.real = 'false'; if (quiet <= 4) return; lv.fill(0) } // silence: let the bars fall to the floor
      else { quiet = 0; box.dataset.real = 'true' }
      const { shown } = shape(lv)
      for (let i = 0; i < N; i++) {
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
