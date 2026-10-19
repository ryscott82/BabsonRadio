'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/auth'

// Keeps within the station's monthly listener hours. Asks the server before playing, checks in every minute while
// playing, asks "still listening?" after a stretch with no activity, and stops the stream when told to.
// See /api/listen. If the server can't be reached, listening carries on (the server is the stricter check, not a gate on a bad connection).

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

interface Reply { ok: boolean; reason?: string; device?: string; message?: string; idleMin?: number; sessionMaxMin?: number }

export function useListenGuard(playing: boolean, stop: () => void) {
  const [notice, setNotice] = useState('')
  const [elsewhere, setElsewhere] = useState(false)
  const [asking, setAsking] = useState(false)
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
  const begin = useCallback(async (takeOver = false): Promise<boolean> => {
    setNotice(''); setElsewhere(false)
    if (!auth.currentUser) return true
    sid.current = crypto.randomUUID()
    active.current = Date.now()
    try {
      const r = await api<Reply>('/api/listen', { action: 'start', sessionId: sid.current, device: 'web', deviceId: deviceId(), takeOver })
      if (!r.ok) {
        if (r.reason === 'elsewhere') { setElsewhere(true); setNotice(r.message ?? '') } else setNotice(r.message ?? 'Listening is paused right now.')
        sid.current = ''
        return false
      }
      if (r.idleMin) idleMin.current = r.idleMin
    } catch { /* offline or server hiccup: let them listen */ }
    return true
  }, [])

  // While playing: check in each minute, watch the idle clock and the idle prompt.
  useEffect(() => {
    if (!playing) {
      if (sid.current && auth.currentUser) api('/api/listen', { action: 'stop', sessionId: sid.current }).catch(() => {})
      sid.current = ''
      queueMicrotask(() => { setAsking(false) })
      askedAt.current = 0
      return
    }
    let lastBeat = Date.now()
    const t = setInterval(async () => {
      const now = Date.now()
      const idleFor = now - active.current
      if (!askedAt.current && idleFor >= idleMin.current * 60_000) { askedAt.current = now; setAsking(true) }
      if (askedAt.current && now - askedAt.current >= PROMPT_MS) { halt('Stopped because no one seemed to be listening. Tap play to start again.'); return }
      if (now - lastBeat >= 30_000 && sid.current && auth.currentUser) {
        lastBeat = now
        try {
          const r = await api<Reply>('/api/listen', { action: 'beat', sessionId: sid.current, activeAgoSec: Math.round(idleFor / 1000) })
          if (!r.ok) halt(r.message ?? 'Listening stopped.')
          else if (r.idleMin) idleMin.current = r.idleMin
        } catch { /* try again next minute */ }
      }
    }, 5_000)
    return () => clearInterval(t)
  }, [playing, halt])

  const stillHere = useCallback(() => { active.current = Date.now(); askedAt.current = 0; setAsking(false) }, [])
  return { notice, elsewhere, dismissElsewhere: () => { setElsewhere(false); setNotice('') }, clearNotice: () => setNotice(''), asking, stillHere, begin }
}
