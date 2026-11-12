'use client'

import { useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import type { StudioStatus } from '@/lib/booth'

const EVERY_MS = 5 * 60_000

/** Quiet hours and bookings for the studio, asked once when someone signs in and then every 5 minutes. Also checks the person in
 *  (their booking for right now, if they have one). Every call may fail (site down, no booking): the page simply shows nothing then. */
export function useStudioStatus(enabled: boolean) {
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [myBookingId, setMyBookingId] = useState('')
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const load = () => apiGet<StudioStatus>('/api/booth/studio-status').then(s => { if (!stop) setStatus(s) }).catch(() => {})
    api<{ bookingId?: string }>('/api/booth/studio-checkin', {})
      .then(r => { if (!stop && r.bookingId) setMyBookingId(r.bookingId) })
      .catch(() => {})
      .finally(load) // after the check-in, so "Booked now by" knows it is mine
    const t = setInterval(load, EVERY_MS)
    return () => { stop = true; clearInterval(t) }
  }, [enabled])
  return { status, myBookingId }
}
