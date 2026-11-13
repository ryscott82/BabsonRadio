'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { CLIP_DBFS, nextGain } from '@/lib/booth'
import { errText, helper, loadPref, savePref } from './helper'
import type { MeterFrame } from './useInputMeter'
import type { AutoLevel } from './LevelMeter'

/** Auto level: once a second, nudges BUTT's Master Gain (through the helper's MIDI link) toward the station's level. */
export function useAutoGain(frame: RefObject<MeterFrame>, getToken: () => Promise<string>): AutoLevel {
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState('')
  const [db, setDb] = useState(0)
  const [on, setOn] = useState(() => loadPref('autoLevel', '1') === '1')
  const dbRef = useRef(0)

  // Asks the helper if the MIDI add-on is ready: now, and once a minute until it is (the control appears by itself, no site change needed).
  useEffect(() => {
    let stop = false
    const ask = () => helper<{ available: boolean; db: number; error: string }>('/gain')
      .then(r => { if (stop) return; setAvailable(r.available); setError(r.error); setDb(r.db); dbRef.current = r.db })
      .catch(() => { if (!stop) setAvailable(false) })
    ask()
    const t = available ? null : setInterval(ask, 60_000)
    return () => { stop = true; if (t) clearInterval(t) }
  }, [available])

  const send = useCallback(async (value: number) => {
    const r = await helper<{ db: number }>('/gain', { token: await getToken(), db: value })
    dbRef.current = r.db; setDb(r.db)
  }, [getToken])

  useEffect(() => {
    if (!on || !available) return
    const t = setInterval(() => {
      const f = frame.current
      const clipped = Math.max(f.peak[0], f.peak[1]) + dbRef.current >= CLIP_DBFS
      const next = nextGain(dbRef.current, f.short, f.momentary, clipped)
      if (Math.abs(next - dbRef.current) >= 0.3) send(next).catch(e => setError(errText(e)))
    }, 1000)
    return () => clearInterval(t)
  }, [on, available, frame, send])

  const toggle = useCallback(() => {
    const v = !on
    setOn(v); savePref('autoLevel', v ? '1' : '0')
    if (!v) send(0).catch(e => setError(errText(e))) // back to unity gain, so the mixer alone sets the level
  }, [on, send])

  return { available, on: on && available, db, error, toggle }
}
