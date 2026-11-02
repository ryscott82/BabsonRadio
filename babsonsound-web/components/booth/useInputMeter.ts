'use client'

import { useEffect, useRef, useState } from 'react'
import { CLIP_DBFS, dbOf, levelState, lufsOf, type LevelState } from '@/lib/booth'

// Reads the studio input (the mixer feed BUTT streams) in the browser and measures it: peak and RMS per channel, and
// approximate BS.1770 loudness (K-weighted) over 400 ms (momentary) and 3 s (short-term). Nothing is played back.

export interface MeterFrame {
  peak: [number, number]; rms: [number, number]; hold: [number, number]
  momentary: number; short: number; clipAt: number
  history: number[] // short-term loudness, one value per 500 ms, last 2 minutes
}
export interface MeterStats { state: LevelState; short: number; peak: number; silentFor: number; clipping: boolean; on: boolean }

const OFF: MeterStats = { state: 'off', short: -Infinity, peak: -Infinity, silentFor: 0, clipping: false, on: false }
const HOLD_MS = 1500

export function useInputMeter(deviceId: string, enabled: boolean) {
  const frame = useRef<MeterFrame>({ peak: [-Infinity, -Infinity], rms: [-Infinity, -Infinity], hold: [-Infinity, -Infinity], momentary: -Infinity, short: -Infinity, clipAt: 0, history: [] })
  const [stats, setStats] = useState<MeterStats>(OFF)
  const [error, setError] = useState('')
  const [devicesChanged, setDevicesChanged] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let stop = false, raf = 0, timer = 0
    let ctx: AudioContext | null = null, stream: MediaStream | null = null
    const resume = () => { ctx?.resume().catch(() => {}) }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
        })
      } catch (e) {
        if (!stop) setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Chrome blocked the microphone for this page.' : "Can't open that input.")
        return
      }
      if (stop) { stream.getTracks().forEach(t => t.stop()); return }
      setError('')
      setDevicesChanged(n => n + 1) // labels appear once access is granted
      ctx = new AudioContext({ latencyHint: 'interactive' })
      window.addEventListener('pointerdown', resume)
      const src = ctx.createMediaStreamSource(stream)
      const stereo = (stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2) >= 2
      const split = ctx.createChannelSplitter(2)
      src.connect(split)
      const mk = () => { const a = ctx!.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0; return a }
      const an = [mk(), mk()]
      split.connect(an[0], 0)
      split.connect(an[1], stereo ? 1 : 0)
      // K-weighting: high shelf (+4 dB above ~1.7 kHz), then high-pass at 38 Hz.
      const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1681; shelf.gain.value = 4
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5
      const ak = mk()
      src.connect(shelf).connect(hp).connect(ak)

      const buf = new Float32Array(2048)
      const ms: { t: number; v: number }[] = []
      const holdAt = [0, 0]
      let lastHist = 0, silentSince = 0

      const tick = () => {
        if (stop) return
        const now = performance.now()
        const f = frame.current
        for (let c = 0; c < 2; c++) {
          an[c].getFloatTimeDomainData(buf)
          let pk = 0, sq = 0
          for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > pk) pk = v; sq += buf[i] * buf[i] }
          const p = dbOf(pk)
          f.peak[c] = p; f.rms[c] = dbOf(Math.sqrt(sq / buf.length))
          if (p >= f.hold[c] || now - holdAt[c] > HOLD_MS) { f.hold[c] = p; holdAt[c] = now }
          if (p >= CLIP_DBFS) f.clipAt = Date.now()
        }
        ak.getFloatTimeDomainData(buf)
        let sq = 0
        for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i]
        ms.push({ t: now, v: sq / buf.length })
        while (ms.length && now - ms[0].t > 3000) ms.shift()
        const mean = (win: number) => { let s = 0, n = 0; for (const x of ms) if (now - x.t <= win) { s += x.v; n++ } return n ? s / n : 0 }
        f.momentary = lufsOf(mean(400)); f.short = lufsOf(mean(3000))
        if (now - lastHist >= 500) { lastHist = now; f.history.push(f.short); if (f.history.length > 240) f.history.shift() }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      // A slower snapshot for words and alarms.
      timer = window.setInterval(() => {
        const f = frame.current
        const peak = Math.max(f.hold[0], f.hold[1])
        const clipping = Date.now() - f.clipAt < 2000
        const state = ctx?.state === 'running' ? levelState(f.short, peak, clipping) : 'off'
        if (state === 'silent') silentSince ||= Date.now(); else silentSince = 0
        setStats({ state, short: f.short, peak, clipping, silentFor: silentSince ? (Date.now() - silentSince) / 1000 : 0, on: ctx?.state === 'running' })
      }, 250)
    })()

    return () => {
      stop = true
      cancelAnimationFrame(raf); clearInterval(timer)
      window.removeEventListener('pointerdown', resume)
      stream?.getTracks().forEach(t => t.stop())
      ctx?.close().catch(() => {})
      setStats(OFF)
    }
  }, [deviceId, enabled])

  return { frame, stats, error, devicesChanged }
}
