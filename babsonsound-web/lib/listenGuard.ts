'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/auth'
import { DEFAULT_REFRESH_SEC, RESUME_MIN_AGE_MS, type MeBundle } from '@/lib/liveBundle'
import { ingestMe, meRequest, setListening } from '@/lib/liveStore'

// The listening check-in (see POST /api/listen). One call when playing starts (the one-device rule, being counted as tuned in, and your own
// data), one about every 12 minutes while it plays (and when a hidden tab comes back to the front), and a best-effort one when it stops.
// "Still listening?" and the longest session are this page's own timers: they make no calls. The server tells us the numbers.
// If the server can't be reached, listening carries on (the server is the stricter check, not a gate on a bad connection).

const PROMPT_MS = 2 * 60_000
const DEVICE_KEY = 'br_device_id'

/** A stable id for this browser, so reloading the page isn't mistaken for a second device. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch { return 'web' }
}

interface Reply {
  ok: boolean; reason?: string; device?: string; message?: string
  refreshSec?: number; idleMin?: number; sessionMaxMin?: number; me?: MeBundle
}

export function useListenGuard(playing: boolean, stop: () => void) {
  const [notice, setNotice] = useState('')
  const [elsewhere, setElsewhere] = useState(false)
  const [asking, setAsking] = useState(false)
  const sid = useRef('')
  const active = useRef(0)
  const startedAt = useRef(0)
  const idleMin = useRef(60)
  const sessionMaxMin = useRef(360)
  const refreshMs = useRef(DEFAULT_REFRESH_SEC * 1000)
  const lastCheckIn = useRef(0)
  const token = useRef('')
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

  /** Use what the server answered: the numbers for the page's own timers, the interval to the next check-in, and your own data. */
  const take = useCallback((r: Reply, asked: string) => {
    if (r.idleMin) idleMin.current = r.idleMin
    if (typeof r.sessionMaxMin === 'number') sessionMaxMin.current = r.sessionMaxMin
    if (r.refreshSec && r.refreshSec >= 120) refreshMs.current = r.refreshSec * 1000
    lastCheckIn.current = Date.now()
    setListening(true, refreshMs.current)
    if (r.me) ingestMe(r.me, asked)
    void auth.currentUser?.getIdToken().then(t => { token.current = t }).catch(() => {}) // kept for the stop message when the page closes
  }, [])

  /** Call before starting the stream. Resolves false (and sets a notice) when listening isn't allowed right now. */
  const begin = useCallback(async (takeOver = false): Promise<boolean> => {
    setNotice(''); setElsewhere(false)
    if (!auth.currentUser) return true
    sid.current = crypto.randomUUID()
    active.current = Date.now()
    startedAt.current = Date.now()
    try {
      const want = meRequest()
      const r = await api<Reply>('/api/listen', { action: 'start', sessionId: sid.current, device: 'web', deviceId: deviceId(), takeOver, ...want })
      if (!r.ok) {
        if (r.reason === 'elsewhere') { setElsewhere(true); setNotice(r.message ?? '') } else setNotice(r.message ?? 'Listening is paused right now.')
        sid.current = ''
        return false
      }
      take(r, want.sections)
    } catch { /* offline or server hiccup: let them listen */ }
    return true
  }, [take])

  // While playing: the idle prompt and the longest session run here with no calls; the check-in goes out about every 12 minutes.
  useEffect(() => {
    if (!playing) {
      setListening(false)
      if (sid.current && auth.currentUser) api('/api/listen', { action: 'stop', sessionId: sid.current }).catch(() => {})
      sid.current = ''
      queueMicrotask(() => { setAsking(false) })
      askedAt.current = 0
      return
    }
    let busy = false
    const checkIn = async () => {
      if (busy || !sid.current || !auth.currentUser) return
      busy = true
      try {
        const want = meRequest()
        const r = await api<Reply>('/api/listen', { action: 'refresh', sessionId: sid.current, device: 'web', deviceId: deviceId(), ...want })
        if (!r.ok) halt(r.message ?? 'Listening stopped.')
        else take(r, want.sections)
      } catch { lastCheckIn.current = Date.now() /* try again at the next interval */ }
      finally { busy = false }
    }
    const t = setInterval(() => { // local only: a minute-grained look at the clocks
      const now = Date.now()
      const idleFor = now - active.current
      if (!askedAt.current && idleMin.current > 0 && idleFor >= idleMin.current * 60_000) { askedAt.current = now; setAsking(true) }
      if (askedAt.current && now - askedAt.current >= PROMPT_MS) { halt('Stopped because no one seemed to be listening. Tap play to start again.'); return }
      const max = sessionMaxMin.current
      if (max > 0 && startedAt.current && now - startedAt.current > max * 60_000) { halt(`Stopped after ${Math.round(max / 6) / 10} hours. Tap play to keep listening.`); return }
      if (now - lastCheckIn.current >= refreshMs.current) void checkIn() // keeps going in a hidden tab while audio plays: the one check-in that must not stop
    }, 15_000)
    // A hidden tab that comes back to the front checks in at once (unless it just did).
    const onVisible = () => { if (!document.hidden && Date.now() - lastCheckIn.current >= RESUME_MIN_AGE_MS) void checkIn() }
    // Closing the page: a best-effort stop (the request outlives the page). If it is lost, presence expires 18 minutes after the last check-in.
    const onHide = () => {
      if (!sid.current || !token.current) return
      try {
        void fetch('/api/listen', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.current}` }, body: JSON.stringify({ action: 'stop', sessionId: sid.current }) })
      } catch { /* best effort */ }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onHide)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pagehide', onHide) }
  }, [playing, halt, take])

  const stillHere = useCallback(() => { active.current = Date.now(); askedAt.current = 0; setAsking(false) }, [])
  return { notice, elsewhere, dismissElsewhere: () => { setElsewhere(false); setNotice('') }, clearNotice: () => setNotice(''), asking, stillHere, begin }
}
