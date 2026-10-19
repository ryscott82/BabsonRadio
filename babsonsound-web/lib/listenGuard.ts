'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/auth'

// Keeps within the station's monthly listener hours. Asks the server before playing, checks in every minute while
// playing, asks "still listening?" after a stretch with no activity, and stops the stream when told to.
// See /api/listen. If the server can't be reached, listening carries on (the server is the stricter check, not a gate on a bad connection).

const PROMPT_MS = 2 * 60_000
const SLEEP_KEY = 'br_sleep_default'

interface Reply { ok: boolean; reason?: string; message?: string; idleMin?: number; sessionMaxMin?: number }

export function useListenGuard(playing: boolean, stop: () => void) {
  const [notice, setNotice] = useState('')
  const [asking, setAsking] = useState(false)
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const sid = useRef('')
  const active = useRef(Date.now())
  const idleMin = useRef(60)
  const askedAt = useRef(0)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])

  // Any sign of life resets the idle clock.
  useEffect(() => {
    const mark = () => { active.current = Date.now(); if (askedAt.current) { askedAt.current = 0; setAsking(false) } }
    const ev = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'] as const
    ev.forEach(e => window.addEventListener(e, mark, { passive: true }))
    return () => ev.forEach(e => window.removeEventListener(e, mark))
  }, [])

  const halt = useCallback((message: string) => { stopRef.current(); setAsking(false); askedAt.current = 0; setNotice(message) }, [])

  /** Call before starting the stream. Resolves false (and sets a notice) when listening isn't allowed right now. */
  const begin = useCallback(async (): Promise<boolean> => {
    setNotice('')
    if (!auth.currentUser) return true
    sid.current = crypto.randomUUID()
    active.current = Date.now()
    try {
      const r = await api<Reply>('/api/listen', { action: 'start', sessionId: sid.current, device: 'web' })
      if (!r.ok) { setNotice(r.message ?? 'Listening is paused right now.'); return false }
      if (r.idleMin) idleMin.current = r.idleMin
    } catch { /* offline or server hiccup: let them listen */ }
    // After 10pm (and before 5am) a sleep timer starts on its own, so a stream isn't left running all night.
    const h = new Date().getHours()
    let off = false
    try { off = localStorage.getItem(SLEEP_KEY) === 'off' } catch { /* private mode */ }
    if (!off && (h >= 22 || h < 5)) setSleepAt(Date.now() + 60 * 60_000)
    return true
  }, [])

  // While playing: check in each minute, watch the idle clock and the sleep timer.
  useEffect(() => {
    if (!playing) {
      if (sid.current && auth.currentUser) api('/api/listen', { action: 'stop', sessionId: sid.current }).catch(() => {})
      sid.current = ''
      queueMicrotask(() => { setSleepAt(null); setAsking(false) })
      askedAt.current = 0
      return
    }
    let lastBeat = Date.now()
    const t = setInterval(async () => {
      const now = Date.now()
      if (sleepAt && now >= sleepAt) { halt('Sleep timer ended. Good night.'); return }
      const idleFor = now - active.current
      if (!askedAt.current && idleFor >= idleMin.current * 60_000) { askedAt.current = now; setAsking(true) }
      if (askedAt.current && now - askedAt.current >= PROMPT_MS) { halt('Stopped because no one seemed to be listening. Tap play to start again.'); return }
      if (now - lastBeat >= 60_000 && sid.current && auth.currentUser) {
        lastBeat = now
        try {
          const r = await api<Reply>('/api/listen', { action: 'beat', sessionId: sid.current, activeAgoSec: Math.round(idleFor / 1000) })
          if (!r.ok) halt(r.message ?? 'Listening stopped.')
          else if (r.idleMin) idleMin.current = r.idleMin
        } catch { /* try again next minute */ }
      }
    }, 5_000)
    return () => clearInterval(t)
  }, [playing, sleepAt, halt])

  const stillHere = useCallback(() => { active.current = Date.now(); askedAt.current = 0; setAsking(false) }, [])
  const setSleep = useCallback((minutes: number | null) => {
    setSleepAt(minutes ? Date.now() + minutes * 60_000 : null)
    try { localStorage.setItem(SLEEP_KEY, minutes ? 'on' : 'off') } catch { /* ignore */ }
  }, [])
  return { notice, clearNotice: () => setNotice(''), asking, stillHere, begin, sleepAt, setSleep }
}
