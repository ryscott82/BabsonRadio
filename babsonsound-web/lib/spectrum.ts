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

interface Tap { ctx: AudioContext; an: AnalyserNode; data: Uint8Array<ArrayBuffer>; master: GainNode; direct: GainNode; dry: GainNode; drive: GainNode; wet: GainNode; ex: GainNode; low: BiquadFilterNode; air: BiquadFilterNode; comp: DynamicsCompressorNode }
/** The sound is held back this long before the speakers while the analyser hears it right away, so the lights line up with what you hear. */
export const AUDIO_DELAY_MS = 216

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
    an.fftSize = 2048; an.smoothingTimeConstant = 0.15; an.minDecibels = -90; an.maxDecibels = -6
    const src = ctx.createMediaElementSource(el)
    const out = ctx.createDelay(1)
    out.delayTime.value = AUDIO_DELAY_MS / 1000
    const master = ctx.createGain()
    master.gain.value = masterLevel
    out.connect(master); master.connect(ctx.destination)
    src.connect(an) // analyser is a side branch; the sound itself goes src -> gain -> speakers
    // Sound path: src -> direct -> speakers while the knob is at or below 100% (untouched). Past 100% the sound goes through
    // dry + a saturated copy (drive -> tube-style shaper -> wet), summed and rounded off by a soft clipper.
    const direct = ctx.createGain(), dry = ctx.createGain(), drive = ctx.createGain(), wet = ctx.createGain()
    const sat = ctx.createWaveShaper(), clip = ctx.createWaveShaper(), bus = ctx.createGain()
    sat.curve = tubeCurve(); sat.oversample = '4x'
    clip.curve = softClipCurve(); clip.oversample = '2x'
    dry.gain.value = 0; wet.gain.value = 0; drive.gain.value = 1; bus.gain.value = 0.9
    src.connect(direct); direct.connect(out)
    src.connect(dry); dry.connect(bus)
    src.connect(drive); drive.connect(sat); sat.connect(wet); wet.connect(bus)
    // Sparkle: only the highs are driven into a shaper and blended back in (harmonic excitement instead of a crushed mix).
    const hp = ctx.createBiquadFilter(), exSat = ctx.createWaveShaper(), exDrive = ctx.createGain(), ex = ctx.createGain()
    hp.type = 'highpass'; hp.frequency.value = 3200; exDrive.gain.value = 5; exSat.curve = tubeCurve(); exSat.oversample = '4x'; ex.gain.value = 0
    src.connect(hp); hp.connect(exDrive); exDrive.connect(exSat); exSat.connect(ex); ex.connect(bus)
    // Weight: a low shelf for chest, an air shelf for shine, then a glue compressor so loudness comes from density, and a limiter as the ceiling.
    const low = ctx.createBiquadFilter(), air = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor(), lim = ctx.createDynamicsCompressor()
    low.type = 'lowshelf'; low.frequency.value = 95; low.gain.value = 0
    air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = 0
    comp.threshold.value = 0; comp.ratio.value = 1; comp.knee.value = 18; comp.attack.value = 0.012; comp.release.value = 0.16
    lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08
    bus.connect(low); low.connect(air); air.connect(comp); comp.connect(clip); clip.connect(lim); lim.connect(out)
    const tap: Tap = { ctx, an, data: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)), master, direct, dry, drive, wet, ex, low, air, comp }
    taps.set(el, tap); current = tap
    setBoostDb(boostDb)
    return true
  } catch { return false }
}
// Past 100% the knob adds drive: louder, and increasingly saturated (warm, tube-like crunch, some even harmonics), with a
// soft clipper at the end so peaks round off instead of cracking. Below 100% nothing is in the signal path but the element.
let boostDb = 0
// Phones (iPhone Safari) ignore the audio element's volume. When the stream is routed through Web Audio, the knob turns this gain instead.
let masterLevel = 1
let volumeWorks: boolean | null = null
/** False on browsers that ignore element.volume (iPhone). */
export function elementVolumeWorks(): boolean {
  if (volumeWorks === null) { try { const a = new Audio(); a.volume = 0.5; volumeWorks = a.volume === 0.5 } catch { volumeWorks = true } }
  return volumeWorks
}
/** Sets the output level (0 to 1) the way this browser allows: the element volume, or the Web Audio master gain once the stream is routed through it. */
export function applyVolume(el: HTMLAudioElement, v: number) {
  masterLevel = Math.min(1, Math.max(0, v))
  const t = taps.get(el)
  if (t) { el.volume = 1; t.master.gain.setTargetAtTime(masterLevel, t.ctx.currentTime, 0.02) }
  else el.volume = masterLevel
}
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
  t.dry.gain.setTargetAtTime(on ? Math.pow(10, boostDb / 20) * (1 - 0.7 * k) : 0, now, glide)
  t.drive.gain.setTargetAtTime(1 + 4 * k, now, glide)
  t.wet.gain.setTargetAtTime(on ? 0.5 * k : 0, now, glide)
  // The cool part: more chest, more shine, a touch of high-frequency sparkle, and glue compression that grows with the boost.
  t.ex.gain.setTargetAtTime(on ? 0.22 * k : 0, now, glide)
  t.low.gain.setTargetAtTime(on ? 4.5 * k : 0, now, glide)
  t.air.gain.setTargetAtTime(on ? 3 * k : 0, now, glide)
  t.comp.threshold.setTargetAtTime(on ? -10 - 8 * k : 0, now, glide)
  t.comp.ratio.setTargetAtTime(on ? 1.5 + 3.5 * k : 1, now, glide)
}

/** Call from a click/tap handler: browsers keep the audio context asleep until then. */
/** True once the stream is routed through the analyser (so silence can be read as silence, not as "no analysis"). */
export const hasSpectrum = () => !!current
export function wakeSpectrum() { current?.ctx.resume().catch(() => {}) }

/**
 * Fills `out` with 0..1 levels, log-spaced from about 50 Hz to 15 kHz, on a real decibel scale: 0 is -70 dB and 1 is -10 dB
 * (a band of music rarely gets near full scale, so a full bar means a genuinely loud band). Returns false while there is nothing to read.
 * Also measures the stream's sample peak (see streamPeak).
 */
let lastPeak = 0
let td: Uint8Array<ArrayBuffer> | null = null
/** Highest sample of the last frame, 0..1 (1 = 0 dBFS). Before any boost. */
export const streamPeak = () => lastPeak
// Moving bands (the equalizer only): the bar edges glide slowly toward the busiest parts of the spectrum, at most twice as dense
// there as elsewhere, and stay even when the music is steady or quiet.
const ADAPT_R = 24, ADAPT_STRENGTH = 1, ADAPT_GLIDE = 0.01, ADAPT_MIN_FLUX = 1.2
const adapt = { edges: [] as number[], flux: new Array<number>(ADAPT_R).fill(0), prev: new Array<number>(ADAPT_R).fill(0) }
function adaptEdges(an: AnalyserNode, data: Uint8Array, hz: number, n: number): number[] {
  if (adapt.edges.length !== n + 1) adapt.edges = Array.from({ length: n + 1 }, (_, i) => i / n)
  const dbPerByte = (an.maxDecibels - an.minDecibels) / 255
  const lv: number[] = []
  let top = 0
  for (let r = 0; r < ADAPT_R; r++) {
    const lo = Math.max(1, Math.floor((50 * Math.pow(300, r / ADAPT_R)) / hz)), hi = Math.max(lo + 1, Math.ceil((50 * Math.pow(300, (r + 1) / ADAPT_R)) / hz))
    let mx = 0
    for (let k = lo; k < hi && k < data.length; k++) if (data[k] > mx) mx = data[k]
    const d = an.minDecibels + mx * dbPerByte
    lv.push(d); top = Math.max(top, d)
  }
  let fmax = 0
  for (let r = 0; r < ADAPT_R; r++) {
    const step = lv[r] > top - 35 ? Math.min(12, Math.abs(lv[r] - adapt.prev[r])) : 0
    adapt.flux[r] += (step - adapt.flux[r]) * 0.02
    adapt.prev[r] = lv[r]
    fmax = Math.max(fmax, adapt.flux[r])
  }
  const w = new Array<number>(ADAPT_R).fill(1)
  if (fmax > ADAPT_MIN_FLUX) for (let r = 0; r < ADAPT_R; r++) w[r] = 1 + ADAPT_STRENGTH * (adapt.flux[r] / fmax)
  const sm = w.map((v, r) => 0.25 * w[Math.max(0, r - 1)] + 0.5 * v + 0.25 * w[Math.min(ADAPT_R - 1, r + 1)])
  const cum = [0]; for (let r = 0; r < ADAPT_R; r++) cum.push(cum[r] + sm[r])
  const total = cum[ADAPT_R]
  let seg = 0
  for (let k = 1; k < n; k++) {
    const want = (total * k) / n
    while (seg < ADAPT_R - 1 && cum[seg + 1] < want) seg++
    const u = (seg + (want - cum[seg]) / sm[seg]) / ADAPT_R
    adapt.edges[k] += (u - adapt.edges[k]) * ADAPT_GLIDE
  }
  return adapt.edges
}

export function readBands(out: number[], moving = false): boolean {
  if (!current) return false
  const { an, data, ctx } = current
  an.getByteFrequencyData(data)
  if (!td || td.length !== an.fftSize) td = new Uint8Array(new ArrayBuffer(an.fftSize))
  an.getByteTimeDomainData(td)
  let pk = 0
  for (let i = 0; i < td.length; i++) pk = Math.max(pk, Math.abs(td[i] - 128))
  lastPeak = pk / 128
  const n = out.length, hz = ctx.sampleRate / an.fftSize
  const dbPerByte = (an.maxDecibels - an.minDecibels) / 255
  let any = 0
  // Bands are spread unevenly: the lows and highs get a little more room, the crowded mids a little less.
  const warp = (u: number) => u - (0.3 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI)
  const edges = moving ? adaptEdges(an, data, hz, n) : null
  for (let i = 0; i < n; i++) {
    const g0 = warp(edges ? edges[i] : i / n), g1 = warp(edges ? edges[i + 1] : (i + 1) / n)
    const lo = Math.max(1, Math.floor((50 * Math.pow(300, g0)) / hz))
    const hi = Math.max(lo + 1, Math.ceil((50 * Math.pow(300, g1)) / hz))
    // A band shows mostly its loudest bin (a single note or voice is a narrow spike, an average would bury it), plus some of the average.
    let sum = 0, mx = 0
    for (let k = lo; k < hi && k < data.length; k++) { sum += data[k]; if (data[k] > mx) mx = data[k] }
    const v = 0.65 * mx + 0.35 * (sum / (hi - lo))
    any += v / 255
    const db = an.minDecibels + v * dbPerByte
    out[i] = Math.max(0, Math.min(1, (db + 70) / 60 * (1 + 0.1 * ((i + 0.5) / n)))) // barely any tilt: loudness decides, not frequency
  }
  return any > 0.01
}

/**
 * The website's equalizer, modeled on the iOS app's (AudioSpectrum.swift), which is the reference for how it should behave:
 *  - 28 fixed log-spaced regions from 50 Hz to 13 kHz, in dB with a gentle lift for the highs; the busiest regions are tracked
 *    (a slow average of how much each one changes) and the display bar edges glide toward them, never more than twice as dense;
 *  - the loudness reference follows the song's recent level, so hits stand out and quiet parts stay low;
 *  - every bar keeps its own recent floor and ceiling and spreads its movement between them, so each uses its whole height;
 *  - a bar far below the loudest material stays lower than one carrying the track (`presence`);
 *  - fast attack, slower release; the top bars never go fully dark while music plays.
 * All the per-update rates are the iOS numbers, rescaled to the real frame time (the iOS meter updates about every 23 ms).
 * Call `step(dt)` once per frame; it returns the n bar levels (0..1) or null when there is no sound.
 */
const IOS_UPDATE_MS = 23
const IOS_TUNE = {
  headroomDB: 9, rangeDB: 30, followUp: 0.03, followDown: 0.008, attack: 0.7, release: 0.8, trebleFloor: 0.04,
  adaptStrength: 1, adaptGlide: 0.012, adaptMinFlux: 0.6, bandMinRangeDB: 7, bandHiFall: 0.006, bandLoRise: 0.003, bandCurve: 1.2,
}
export function createIosEq(n: number) {
  const R = 28 // fixed analysis regions
  const edgeU = Array.from({ length: n + 1 }, (_, i) => i / n)
  const prevDb = new Array<number>(R).fill(-120), flux = new Array<number>(R).fill(0)
  const smoothD = new Array<number>(n).fill(0), bandLo = new Array<number>(n).fill(0), bandHi = new Array<number>(n).fill(0)
  let seeded = false, ref = -60
  let buf: Float32Array<ArrayBuffer> | null = null
  const rate = (coef: number, dt: number) => 1 - Math.pow(1 - coef, dt / IOS_UPDATE_MS)

  /** Mean-power dB of a frequency range (with the high-frequency tilt). */
  const bandDb = (lo: number, hi: number, tilt: number) => {
    let sum = 0
    for (let k = lo; k <= hi; k++) sum += Math.pow(10, buf![k] / 10)
    return 10 * Math.log10(sum / (hi - lo + 1) + 1e-12) + tilt
  }

  return function step(dt: number): number[] | null {
    if (!current) return null
    const { an, ctx } = current
    if (!buf || buf.length !== an.frequencyBinCount) buf = new Float32Array(new ArrayBuffer(an.frequencyBinCount * 4))
    an.getFloatFrequencyData(buf)
    for (let k = 0; k < buf.length; k++) if (!(buf[k] > -140)) buf[k] = -140   // -Infinity / NaN when silent
    const hz = ctx.sampleRate / an.fftSize
    const lowF = 50, highF = Math.min(13000, ctx.sampleRate / 2 - 500), ratio = highF / lowF
    const range = (u0: number, u1: number) => {
      const f0 = lowF * Math.pow(ratio, u0), f1 = lowF * Math.pow(ratio, u1)
      const lo = Math.min(buf!.length - 3, Math.max(1, Math.floor(f0 / hz)))
      const hi = Math.min(buf!.length - 2, Math.max(lo + 1, Math.floor(f1 / hz)))
      return { lo, hi, tilt: 3.2 * Math.log2(Math.sqrt(f0 * f1) / 100) }
    }
    // Fixed regions: the loudness reference and where things are changing.
    const db = new Array<number>(R)
    let peak = -120
    for (let b = 0; b < R; b++) {
      const r = range(b / R, (b + 1) / R)
      db[b] = bandDb(r.lo, r.hi, r.tilt)
      if (db[b] > peak) peak = db[b]
    }
    if (peak <= -85) { smoothD.fill(0); return null }
    const fr = rate(0.012, dt)
    for (let b = 0; b < R; b++) {
      const loud = db[b] > peak - 35
      const st = loud ? Math.min(12, Math.abs(db[b] - prevDb[b])) : 0
      flux[b] += (st - flux[b]) * fr
      prevDb[b] = db[b]
    }
    // Move the display bar edges toward the busiest regions, slowly.
    const mx = Math.max(...flux)
    const w = new Array<number>(R).fill(1)
    if (mx > IOS_TUNE.adaptMinFlux) for (let i = 0; i < R; i++) w[i] = 1 + IOS_TUNE.adaptStrength * (flux[i] / mx)
    const sm = w.map((v, i) => 0.25 * w[Math.max(0, i - 1)] + 0.5 * v + 0.25 * w[Math.min(R - 1, i + 1)])
    const cum = [0]; for (let i = 0; i < R; i++) cum.push(cum[i] + sm[i])
    const total = cum[R], glide = rate(IOS_TUNE.adaptGlide, dt)
    let seg = 0
    for (let k = 1; k < n; k++) {
      const want = (total * k) / n
      while (seg < R - 1 && cum[seg + 1] < want) seg++
      const u = (seg + (want - cum[seg]) / Math.max(1e-9, sm[seg])) / R
      edgeU[k] += (u - edgeU[k]) * glide
    }
    // Reference level: follows the song's recent loudness, not its instant peak.
    if (peak > ref + 25) ref = peak
    ref += (peak - ref) * (peak > ref ? rate(IOS_TUNE.followUp, dt) : rate(IOS_TUNE.followDown, dt))
    const ceiling = ref + IOS_TUNE.headroomDB, floor = ceiling - IOS_TUNE.rangeDB
    const out = new Array<number>(n).fill(0)
    const atk = rate(IOS_TUNE.attack, dt), rel = rate(1 - IOS_TUNE.release, dt)
    const hiFall = rate(IOS_TUNE.bandHiFall, dt), loRise = rate(IOS_TUNE.bandLoRise, dt), loFall = rate(0.25, dt)
    for (let b = 0; b < n; b++) {
      const r = range(edgeU[b], edgeU[b + 1])
      const d = bandDb(r.lo, r.hi, r.tilt)
      const lind = Math.min(1, Math.max(0, (d - floor) / IOS_TUNE.rangeDB))
      if (!seeded) { bandLo[b] = d; bandHi[b] = d }
      if (d > bandHi[b]) bandHi[b] = d; else bandHi[b] -= (bandHi[b] - d) * hiFall
      if (d < bandLo[b]) bandLo[b] += (d - bandLo[b]) * loFall; else bandLo[b] += (d - bandLo[b]) * loRise
      const span = Math.max(IOS_TUNE.bandMinRangeDB, bandHi[b] - bandLo[b])
      const nrm = Math.min(1, Math.max(0, (d - bandLo[b]) / span))
      const presence = Math.min(1, 0.4 + 0.9 * lind)
      const td = Math.pow(nrm, IOS_TUNE.bandCurve) * presence
      smoothD[b] = td > smoothD[b] ? smoothD[b] + (td - smoothD[b]) * atk : smoothD[b] + (td - smoothD[b]) * rel
      const pos = b / Math.max(1, n - 1)
      const lift = IOS_TUNE.trebleFloor * Math.min(1, Math.max(0, (pos - 0.4) / 0.25))
      out[b] = Math.max(smoothD[b], lift)
    }
    seeded = true
    return out
  }
}

/** A soft knee at the top so the loudest hits actually reach the top segments (and the red) while the middle stays as it was. */
export const meterKnee = (v: number) => Math.min(1, v + 0.12 * v * v * v)

// The player registers its audio element so the visuals can tell whether anything is playing (the element is never in the page).
let player: HTMLAudioElement | null = null
export function registerAudio(el: HTMLAudioElement | null) { player = el }
export const sharedAudio = () => player
export const audioPlaying = () => !!player && !player.paused && !player.ended

/**
 * Turns band levels into what the eyes should see, realistic but lively:
 *  - a band sitting steadily at some level shows mid-height; only real hits (well above its own recent average) jump up, and only
 *    genuinely loud bands reach the top;
 *  - the attack follows how hard a band hit: loud bursts shoot up, soft or steady sound creeps;
 *  - the noise floor adapts fast (each band's recent minimum counts as zero) while the ceiling barely adapts, so a thumping bass gets lots of movement;
 *  - loudness-first gain: the loudest band lately is scaled to about 85% whatever its frequency, so sparse music (one instrument) still shows;
 *  - a kick (a sudden jump in the lowest bands) flashes every band slightly (`flash`, 0..1);
 *  - silence drops everything to the floor within about a tenth of a second.
 * Call the returned function once per frame with the levels from readBands; it returns `shown` (0..1 per band) and `flash`.
 */
export function makeShaper(n: number) {
  const hi = new Array<number>(n).fill(0), avg = new Array<number>(n).fill(0), shown = new Array<number>(n).fill(0), floor = new Array<number>(n).fill(0)
  let flash = 0, kickAvg = 0, cool = 0, gmax = 0.8
  return (raw: number[]) => {
    let mean = 0, top = 0
    for (let i = 0; i < n; i++) { mean += raw[i]; top = Math.max(top, raw[i]) }
    mean /= n
    const quiet = mean < 0.04
    gmax = top > gmax ? top : gmax + (top - gmax) * 0.0012 // loudest band lately: up at once, down very slowly (the ceiling barely adapts)
    // Loudest thing first: whichever band is loudest lately is brought to about 85%, wherever it sits in the spectrum, so a lone
    // melody line fills the display the same as a full band does (quiet bands next to it stay low).
    const gain = Math.max(0.85, Math.min(1.6, 0.85 / Math.max(0.3, gmax)))
    const kr = n > 1 ? (raw[0] + raw[1]) / 2 : raw[0]
    kickAvg += (kr - kickAvg) * 0.05
    if (cool > 0) cool--
    if (!quiet && cool === 0 && kr - kickAvg > 0.12 && kr > 0.3) { flash = 1; cool = 9 }
    flash *= 0.88
    for (let i = 0; i < n; i++) {
      // The floor adapts quickly: each band's own recent minimum (the gaps between kicks, the hush under a held note) counts as zero, so
      // what is left is movement. A thumping bass swings the whole height; steady wash sinks away instead of holding the bar up.
      floor[i] = raw[i] < floor[i] ? raw[i] : floor[i] + (raw[i] - floor[i]) * 0.02
      const fl = floor[i] * 0.9
      const u0 = Math.min(1, Math.max(0, (raw[i] - fl) * gain) / Math.max(0.35, 1 - fl * gain))
      // Each band also keeps its own recent ceiling (slow to come down) and spreads its movement up to it, so every bar uses its height.
      hi[i] = raw[i] > hi[i] ? raw[i] : hi[i] - (hi[i] - raw[i]) * 0.004
      const own = Math.min(1, Math.max(0, raw[i] - fl) / Math.max(0.12, hi[i] - fl))
      const u = quiet ? u0 : 0.4 * u0 + 0.6 * own * Math.max(0.5, Math.min(1, u0 * 1.6 + 0.3))
      const mid = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 2) // 0 at the ends, 1 in the middle
      avg[i] += (u - avg[i]) * 0.03
      const burst = Math.max(0, u - avg[i])
      const base = Math.pow(u, 1.6) * 0.78 + burst * 1.6
      // While music plays the upper bands never go fully dark: a quiet treble still shows a segment or two.
      const lift = i / n > 0.4 ? 0.04 * Math.min(1, (i / n - 0.4) / 0.25) : 0
      const target = quiet ? 0.02 : Math.max(lift, Math.min(1, base * (1 - 0.15 * mid) + flash * 0.1))
      const atk = Math.min(1, 0.15 + burst * 5)
      shown[i] = target > shown[i] ? shown[i] + (target - shown[i]) * atk : Math.max(target, shown[i] * (quiet ? 0.45 : 0.8))
    }
    return { shown, flash }
  }
}

/**
 * Drives the LED bars inside `ref` (children <i>) while `playing`: sets --lv (lit height, snapped to whole segments)
 * and --pk (peak cap) on each, and marks the container data-real="true" once real audio is flowing.
 */
// (Peak values are still tracked, but no longer drawn.) They stay put for a few seconds after a hit, then sink slowly (segments per millisecond).
const PEAK_HOLD_MS = 2500, PEAK_FALL_PER_MS = 0.004
/** How long the top red light stays lit after a column hits the top. */
const TOP_HOLD_MS = 1000
/** Level above which a column is in the red zone's reach; see the clip gate in useLedSpectrum. */
const CLIP_CAP = 0.8
const ledLast = new WeakMap<HTMLElement, { lv: number[]; pk: number[] }>()
/** True on a low or draining battery (Chrome and Android report it; Safari does not, so iPhones fall back to the reduced-motion setting). */
let lowBattery = false
if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
  (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> }).getBattery().then(b => {
    const upd = () => { lowBattery = !b.charging && b.level <= 0.2 }
    upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd)
  }).catch(() => {})
}
export const lowPowerHint = () => lowBattery

export function useLedSpectrum(ref: RefObject<HTMLElement | null>, playing: boolean, segments = 9) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const bars = Array.from(box.children) as HTMLElement[]
    if (!playing || !bars.length) {
      // Paused: the bars ease down over about a second, like a real meter, instead of snapping off.
      const last = ledLast.get(box)
      if (!last || box.dataset.real !== 'true' || !last.lv.some(v => v > 0)) { box.dataset.real = 'false'; return }
      let raf = 0
      const fall = () => {
        let any = false
        for (let i = 0; i < bars.length; i++) {
          last.lv[i] = Math.max(0, last.lv[i] - 1 / 40); last.pk[i] = Math.max(0, last.pk[i] - 1 / 30)
          if (last.lv[i] > 0 || last.pk[i] > 0) any = true
          bars[i].style.setProperty('--lv', String(last.lv[i])); bars[i].style.setProperty('--pk', String(last.pk[i]))
          bars[i].dataset.hot = '0'
        }
        if (any) raf = requestAnimationFrame(fall); else box.dataset.real = 'false'
      }
      raf = requestAnimationFrame(fall)
      return () => cancelAnimationFrame(raf)
    }
    const N = bars.length
    const lv = new Array<number>(N).fill(0), pk = new Array<number>(N).fill(0), hold = new Array<number>(N).fill(0), top = new Array<number>(N).fill(0)
    const eq = createIosEq(N)
    let raf = 0, quiet = 0
    let lastT = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const nowT = performance.now(), dt = Math.min(100, nowT - lastT); lastT = nowT
      if (document.hidden) return
      if (lowBattery) { box.dataset.real = 'false'; return }
      readBands(lv)   // keeps the stream's peak (for the red cap) up to date
      const lvls = eq(dt)
      if (!lvls) {
        // Silence (or the analyser warming up): the bars fall to the floor and stay dead. The canned CSS motion is only for when there is no analyser at all.
        quiet++
        if (!hasSpectrum()) { if (quiet > 180) box.dataset.real = 'false'; if (quiet <= 4) return }
        else box.dataset.real = 'true'
        lv.fill(0)
      }
      else { quiet = 0; box.dataset.real = 'true' }
      // Red is for the truly loudest moments: above CLIP_CAP a column only climbs if it is within a hair of the loudest column right now,
      // and only while that column is itself near full scale. Everything else tops out in yellow.
      const kneed = lvls ? lvls.map(meterKnee) : null
      const peakNow = kneed ? Math.max(...kneed) : 0
      const loudGate = Math.min(1, Math.max(0, (peakNow - 0.9) / 0.06))
      const shown = kneed ? kneed.map(v => v <= CLIP_CAP ? v : CLIP_CAP + (v - CLIP_CAP) * Math.min(1, Math.max(0, (v - (peakNow - 0.06)) / 0.06)) * loudGate) : lv
      for (let i = 0; i < N; i++) {
        const segs = Math.round(shown[i] * segments)
        if (segs >= pk[i]) { pk[i] = segs; hold[i] = PEAK_HOLD_MS } else if ((hold[i] -= dt) <= 0) pk[i] = Math.max(0, pk[i] - dt * PEAK_FALL_PER_MS)
        bars[i].style.setProperty('--lv', String(segs / segments))
        bars[i].style.setProperty('--pk', String(Math.min(segments, Math.round(pk[i])) / segments))
        // No white peak caps. When a column reaches the top, its top (red) light stays lit for a second after.
        if (segs >= segments) top[i] = TOP_HOLD_MS; else top[i] = Math.max(0, top[i] - dt)
        bars[i].dataset.hot = top[i] > 0 ? '1' : '0'
        // The glow takes the color of the bar's highest lit light (green, then yellow, then red), like the lamps themselves.
        const frac = segs / segments
        bars[i].style.setProperty('--glow', frac > 0.86 || top[i] > 0 ? 'var(--eq-r)' : frac > 0.57 ? 'var(--eq-y)' : 'var(--eq-g)')
      }
      ledLast.set(box, { lv: bars.map(b => parseFloat(b.style.getPropertyValue('--lv')) || 0), pk: bars.map(b => parseFloat(b.style.getPropertyValue('--pk')) || 0) })
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); box.dataset.real = 'false' }
  }, [ref, playing, segments])
}
