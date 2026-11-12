'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { loadUsage, saveUsage } from '@/lib/usageStore'
import type { UsageStatus } from '@/lib/usageBanner'

const store = () => { try { return sessionStorage } catch { return null } }

/** The month's server-time status for an Admin: one shared read (see lib/usageStore.ts), refreshed only when the Server load page announces fresher numbers. */
export function useUsageStatus(enabled: boolean): UsageStatus | null {
  const [s, setS] = useState<UsageStatus | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadUsage(() => apiGet<UsageStatus>('/api/admin/server-usage/status'), store()).then(v => { if (alive && v) setS(v) })
    const on = (e: Event) => { const v = (e as CustomEvent<UsageStatus>).detail; saveUsage(v, store()); setS(v) }
    window.addEventListener('usage-status', on)
    return () => { alive = false; window.removeEventListener('usage-status', on) }
  }, [enabled])
  return s
}
