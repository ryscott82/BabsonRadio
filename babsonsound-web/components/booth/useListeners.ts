'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'

/** Listener count and recent reactions for the header (every 15 seconds). */
export function useListeners() {
  const [d, setD] = useState<{ listeners: number; recentReactions: Record<string, number> } | null>(null)
  useEffect(() => {
    const load = () => apiGet<{ listeners: number; recentReactions: Record<string, number> }>('/api/booth/live').then(setD).catch(() => {})
    queueMicrotask(load)
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])
  return d
}
