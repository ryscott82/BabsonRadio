'use client'

import { useEffect, useRef } from 'react'

export interface Ep {
  id: string; title: string; showName: string; showSlug: string; category: string; description: string
  youtubeID: string; thumbnailURL: string; duration: number; publishedAt: number; isNew: boolean
}

export const ago = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / 86_400_000)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** One episode: picture, title, play and save. Play opens the video in a window on the same page. */
export function EpisodeRow({ ep, saved, onSave, onPlay }: { ep: Ep; saved: boolean; onSave: (ep: Ep) => void; onPlay: (ep: Ep) => void }) {
  return (
    <div className="sk-raised rounded-xl p-3 flex gap-3 items-center">
      <button onClick={() => onPlay(ep)} aria-label={`Play ${ep.title}`} className="relative shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-br-green">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ep.thumbnailURL && <img src={ep.thumbnailURL} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-xl">▶</span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-br-dk-text line-clamp-2">{ep.title}</p>
        <p className="text-xs text-br-dk-sub truncate">{ep.showName}{ep.category ? ` · ${ep.category}` : ''}{ep.publishedAt ? ` · ${ago(ep.publishedAt)}` : ''}</p>
      </div>
      <button onClick={() => onSave(ep)} aria-pressed={saved} aria-label={saved ? 'Remove from library' : 'Save to library'}
              className={`sk-key rounded-lg w-9 h-9 shrink-0 ${saved ? 'text-br-gold' : 'text-br-dk-sub hover:text-br-dk-text'}`}>
        {saved ? '★' : '☆'}
      </button>
    </div>
  )
}

/** The video window. Closing it (button, backdrop or Escape) stops playback. */
export function PlayerDialog({ ep, onClose }: { ep: Ep | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ep) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', key)
  }, [ep, onClose])
  if (!ep) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={ep.title} onClick={e => e.stopPropagation()}
           className="sk-raised rounded-2xl w-full max-w-3xl overflow-hidden outline-none">
        <div className="aspect-video bg-black">
          <iframe className="w-full h-full" title={ep.title} allowFullScreen
                  src={`https://www.youtube-nocookie.com/embed/${ep.youtubeID}?autoplay=1&rel=0`}
                  allow="autoplay; encrypted-media; picture-in-picture" />
        </div>
        <div className="p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-br-dk-text">{ep.title}</p>
            <p className="text-xs text-br-dk-sub mt-1">{ep.showName}{ep.category ? ` · ${ep.category}` : ''}</p>
            {ep.description && <p className="text-sm text-br-dk-sub mt-2">{ep.description}</p>}
          </div>
          <button onClick={onClose} className="sk-key rounded-lg px-3 h-9 text-xs font-display tracking-widest text-br-dk-text shrink-0">Close</button>
        </div>
      </div>
    </div>
  )
}
