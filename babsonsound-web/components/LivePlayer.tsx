'use client'

import { useState, useRef, useEffect } from 'react'
import { subscribeToListenerCount } from '@/lib/firestore'

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? ''

export default function LivePlayer() {
  const [isPlaying, setIsPlaying]     = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Subscribe to live listener count from Firestore
  useEffect(() => {
    const unsub = subscribeToListenerCount(setListenerCount)
    return unsub
  }, [])

  function togglePlay() {
    if (!audioRef.current) {
      audioRef.current = new Audio(STREAM_URL)
      audioRef.current.addEventListener('waiting', () => setIsBuffering(true))
      audioRef.current.addEventListener('playing', () => setIsBuffering(false))
    }

    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.src = ''
      setIsPlaying(false)
    } else {
      setIsBuffering(true)
      audioRef.current.src = STREAM_URL
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0C1A13] to-[#080808] grain">
      {/* Green glow */}
      <div className="absolute -top-16 -right-16 w-64 h-64 bg-br-green/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">

        {/* Art block */}
        <div className="relative shrink-0 w-44 h-44 md:w-56 md:h-56 rounded-xl overflow-hidden bg-gradient-to-br from-[#003D27] to-[#006644] grain flex items-center justify-center">
          <div className="text-center">
            <p className="font-display text-br-gold/80 text-sm tracking-[0.4em]">BABSON</p>
            <p className="font-display text-white text-4xl tracking-[0.2em]">RADIO</p>
          </div>
          {/* Gold stripe */}
          <div className="absolute bottom-8 inset-x-0 h-px bg-br-gold/50" />
          {/* LED */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-br-green shadow-[0_0_6px_#006644]' : 'bg-br-dk-muted'}`} />
            <span className="font-display text-[9px] tracking-[0.2em] text-white/40">INTERNET RADIO</span>
          </div>
        </div>

        {/* Info + controls */}
        <div className="flex-1 text-center md:text-left">
          {/* ON AIR badge */}
          <div className="inline-flex items-center gap-1.5 bg-br-red px-3 py-1 rounded mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
            <span className="font-display text-white text-xs tracking-[0.25em]">On Air</span>
          </div>

          <h2 className="font-display text-br-dk-text text-4xl md:text-5xl tracking-wide mb-1">
            Live Stream
          </h2>
          <p className="text-br-dk-sub text-sm mb-6">Babson College — Internet Radio</p>

          {/* EQ animation + play button */}
          <div className="flex items-center gap-5 justify-center md:justify-start">
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-br-gold hover:bg-br-gold/90 transition-all flex items-center justify-center shadow-[0_4px_24px_rgba(221,208,85,0.35)] active:scale-95"
            >
              {isBuffering ? (
                <svg className="w-6 h-6 animate-spin text-br-dk-bg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : isPlaying ? (
                <svg className="w-6 h-6 text-br-dk-bg" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg className="w-6 h-6 text-br-dk-bg translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* EQ bars */}
            {isPlaying && (
              <div className="flex items-end gap-1 h-8">
                {[1,2,3,4].map(i => (
                  <div
                    key={i}
                    className="eq-bar w-1 bg-br-gold rounded-full"
                    style={{ height: '100%', animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            )}

            {/* Listener count */}
            {listenerCount > 0 && (
              <span className="text-br-dk-sub text-sm">
                {listenerCount} listening
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
