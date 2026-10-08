'use client'

import { useNowPlaying } from '@/lib/nowplaying'

/** The last few songs, under the player. Fills the left column and answers "what was that song?". */
export default function RecentlyPlayed() {
  const np = useNowPlaying()
  const list = np?.history ?? []
  const now = np?.receivedAt ?? 0 // the time the feed was fetched, so the ages are stable between refreshes
  if (!list.length) return null
  const ago = (s: number) => {
    if (!s) return ''
    const m = Math.max(0, Math.round((now / 1000 - s) / 60))
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
  }
  return (
    <section className="sk-raised rounded-2xl p-4 mt-6" aria-label="Recently played">
      <h2 className="font-display text-br-gold tracking-widest text-sm mb-3">RECENTLY PLAYED</h2>
      <ul className="space-y-2.5">
        {list.map(h => (
          <li key={`${h.playedAt}-${h.title}`} className="flex items-center gap-3 min-w-0">
            {h.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={h.art} alt="" className="w-11 h-11 rounded-md object-cover shrink-0 bg-br-dk-surface2" loading="lazy" />
            ) : <span className="w-11 h-11 rounded-md shrink-0 bg-br-dk-surface2" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-br-dk-text truncate">{h.title}</span>
              <span className="block text-xs text-br-dk-sub truncate">{h.artist || 'Babson Radio'}</span>
            </span>
            <span className="text-[11px] text-br-dk-muted shrink-0 tabular-nums">{ago(h.playedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
