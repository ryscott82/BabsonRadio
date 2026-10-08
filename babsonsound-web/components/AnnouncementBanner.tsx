'use client'

import { useEffect, useState } from 'react'

// A message from the station to everyone (set in the admin controls). Shows on every page until it expires.
// Listeners can close it; a new message shows again.
export default function AnnouncementBanner() {
  const [a, setA] = useState<{ text: string; updatedAt: number } | null>(null)
  const [closed, setClosed] = useState(0)
  useEffect(() => {
    try { queueMicrotask(() => setClosed(Number(sessionStorage.getItem('br_ann_closed') ?? 0))) } catch { /* ignore */ }
    const load = () => {
      if (document.hidden) return
      fetch('/api/nowplaying').then(r => (r.ok ? r.json() : null)).then(d => setA(d?.announcement ?? null)).catch(() => {})
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])
  if (!a || a.updatedAt === closed) return null
  return (
    <div role="status" className="relative z-[2] bg-br-gold/15 border-b border-br-gold/40 text-br-dk-text text-sm">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-start gap-3">
        <span className="flex-1">{a.text}</span>
        <button type="button" aria-label="Dismiss message" className="text-br-dk-sub shrink-0 px-1"
                onClick={() => { setClosed(a.updatedAt); try { sessionStorage.setItem('br_ann_closed', String(a.updatedAt)) } catch { /* ignore */ } }}>✕</button>
      </div>
    </div>
  )
}
