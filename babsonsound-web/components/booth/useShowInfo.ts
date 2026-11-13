'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/auth'
import { errText, helper } from './helper'
import type { Show } from './ShowInfo'

/** The show's name and hosts, kept on the studio PC by the helper (the same info as the Show info window). Edits save about a second after typing stops. */
export function useShowInfo(getToken: () => Promise<string>, enabled: boolean) {
  const [show, setShow] = useState<Show | null>(null)
  const [error, setError] = useState('')
  const latest = useRef<Show | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try { const s = await helper<Show>('/show/get', { token: await getToken() }); latest.current = s; setShow(s) } catch { /* shows nothing */ }
  }, [getToken])
  useEffect(() => { if (enabled) queueMicrotask(() => { void load() }) }, [enabled, load])

  const flush = useCallback(async () => {
    const s = latest.current
    if (!s) return
    try {
      await api('/api/booth/check-text', { texts: [s.title, ...s.hosts] })
      await helper('/show/set', { token: await getToken(), title: s.title, hosts: s.hosts, description: s.description, category: s.category })
      setError('')
    } catch (e) { setError(errText(e)) }
  }, [getToken])
  const change = useCallback((patch: Partial<Show>) => {
    if (!latest.current) return
    latest.current = { ...latest.current, ...patch }; setShow(latest.current)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 700)
  }, [flush])
  return { show, change, reload: load, error }
}
