'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '@/lib/auth'

// Account settings: reminders before a person's shows and studio bookings. Everything is on until they turn it off (the server holds the defaults).
// GET and PATCH /api/me/reminders; a switch saves as soon as it is tapped and goes back if the save fails.

interface Prefs { email: boolean; push: boolean; dayBefore: boolean; hourBefore: boolean; bookingQuarter: boolean }
const ROWS: { key: keyof Prefs; label: string; hint?: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'App notification' },
  { key: 'dayBefore', label: 'The day before' },
  { key: 'hourBefore', label: '1 hour before' },
  { key: 'bookingQuarter', label: 'Studio booking, 15 minutes before' },
]

export default function ShowReminders() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { apiGet<Prefs>('/api/me/reminders').then(setPrefs).catch(() => {}) }, [])
  if (!prefs) return null

  async function flip(key: keyof Prefs) {
    if (!prefs) return
    const before = prefs
    setPrefs({ ...before, [key]: !before[key] }); setMsg('')
    try { setPrefs(await apiPatch<Prefs>('/api/me/reminders', { [key]: !before[key] })) }
    catch (e) { setPrefs(before); setMsg(e instanceof Error ? e.message : 'Could not save that.') }
  }

  return (
    <div className="sk-raised rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-br-dk-text text-sm font-medium">Show reminders</p>
        <p className="text-br-dk-sub text-sm mt-1">For your shows and studio bookings.</p>
      </div>
      <ul className="space-y-3">
        {ROWS.map(r => (
          <li key={r.key} className="flex items-center justify-between gap-4">
            <span className="text-br-dk-text text-sm">{r.label}</span>
            <button role="switch" aria-checked={prefs[r.key]} aria-label={r.label} onClick={() => void flip(r.key)} className="sk-switch shrink-0"><span className="sk-knob" /></button>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="text-sm text-br-red">{msg}</p>}
    </div>
  )
}
