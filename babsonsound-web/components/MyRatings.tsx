'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'

interface R { shows: { occId: string; title: string; stars: number; at: number }[]; songs: { songId: string; title: string; artist: string; stars: number; at: number }[] }
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
const day = (ms: number) => ms ? new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''

// Everything this person rated, so they can look back at it.
export default function MyRatings() {
  const [r, setR] = useState<R | null>(null)
  const [tab, setTab] = useState<'shows' | 'songs'>('shows')
  useEffect(() => { apiGet<R>('/api/me/ratings').then(setR).catch(() => {}) }, [])
  if (!r || (!r.shows.length && !r.songs.length)) return null
  const rows = tab === 'shows'
    ? r.shows.map(x => ({ k: x.occId, a: x.title || 'Show', b: day(x.at), s: x.stars }))
    : r.songs.map(x => ({ k: x.songId, a: x.title, b: x.artist, s: x.stars }))
  return (
    <div className="sk-raised rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-br-dk-text text-sm font-medium">Your ratings</p>
        <div className="flex gap-2 text-xs">
          {(['shows', 'songs'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                    className={`rounded-full px-3 py-1 ${tab === t ? 'bg-br-gold/20 text-br-gold' : 'text-br-dk-sub'}`}>
              {t === 'shows' ? `Shows ${r.shows.length}` : `Songs ${r.songs.length}`}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-64 overflow-y-auto space-y-1.5">
        {rows.map(x => (
          <li key={x.k} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0"><span className="text-br-dk-text block truncate">{x.a}</span><span className="text-xs text-br-dk-sub block truncate">{x.b}</span></span>
            <span className="text-br-gold shrink-0" aria-label={`${x.s} stars`}>{stars(x.s)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
