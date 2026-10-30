'use client'

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import FitTitle from '@/components/FitTitle'
import OnAirSign from '@/components/OnAirSign'
import ArtDesk from '@/components/ArtDesk'
import { useArtMain, eqZoneVars } from '@/components/ArtTheme'
import { ReactionKeys } from '@/components/LiveExtras'
import type { NowPlaying } from '@/lib/nowplaying'

// Full screen board for a screen on the wall: oak desk, glass clock, cover and record, the title on a leather panel,
// a big LED equalizer and the reaction keys. Laid out on a 1440 x 900 stage that scales to fit any screen.
const W = 1440, H = 900
const BOARD_BARS = Array.from({ length: 56 }, (_, i) => ({ h: 0.35 + ((i * 37) % 10) / 15, d: ((i * 13) % 10) / 10, t: 0.7 + ((i * 53) % 7) / 10 }))

function GlassClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const tick = () => { setNow(new Date()); t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50) }
    tick(); return () => clearTimeout(t)
  }, [])
  const parts = now ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(now) : []
  const time = parts.filter(p => p.type === 'hour' || p.type === 'minute' || p.type === 'literal').map(p => p.value).join('').trim()
  const suffix = parts.find(p => p.type === 'dayPeriod')?.value ?? ''
  const date = now ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(now).replace(/,/g, '').toUpperCase() : ''
  return (
    <div className="hw-glass-frame hw-glass-sm" style={{ left: 860, top: 72, width: 520, height: 124 }}>
      <div className="hw-glass-screen">
        <span className="hw-glass-time">{time}</span>
        {suffix && <span className="hw-glass-ampm">{suffix}</span>}
        <span className="hw-glass-date">{date}</span>
      </div>
    </div>
  )
}

export default function FullBoard({ boardRef, eqRef, showEq, np, hasSong, onAir, glow, awake, setAwake, isPlaying, canPlay, togglePlay, close }: {
  boardRef: RefObject<HTMLDivElement | null>; eqRef: RefObject<HTMLDivElement | null>; showEq: boolean
  np: NowPlaying | null | undefined; hasSong: boolean; onAir: boolean; glow: string
  awake: boolean; setAwake: (v: boolean) => void; isPlaying: boolean; canPlay: boolean; togglePlay: () => void; close: () => void
}) {
  // Phones scroll a long title; larger screens shrink it to fit.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 639px), (pointer: coarse) and (max-width: 1024px)')
    const on = () => setPhone(q.matches)
    on(); q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const [scale, setScale] = useState(1)
  const { colors } = useArtMain() // album-color mode follows into full screen
  const artStyle = colors ? ({ '--art-1': colors[0], '--art-2': colors[1], '--art-3': colors[2], ...eqZoneVars(colors) } as React.CSSProperties) : undefined
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H))
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit)
  }, [])
  const onAirNow = onAir
  const sub = onAirNow && np?.showTitle && !np.showOnly ? `${np.showTitle}${np.streamer ? ` with ${np.streamer}` : ''}` : (np?.artist || 'Live from campus')
  return createPortal(
    <div ref={boardRef} onMouseMove={() => setAwake(true)} onClick={() => setAwake(true)}
         style={artStyle} className={`hw-board ${colors ? 'art-ui art-board ' : ''}fixed inset-0 z-[100] overflow-hidden flex items-center justify-center ${awake ? '' : 'cursor-none'}`}>
      {colors && <ArtDesk inline on colors={colors as [string, string, string, string, string, string]} />}
      <div className="relative shrink-0" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <p className="absolute font-semibold" style={{ left: 80, top: 42, fontSize: 13, letterSpacing: '0.34em', color: 'var(--br-text)', opacity: 0.7 }}>Babson Radio</p>

        <GlassClock />

        {/* Cover and record */}
        <div className="hw-cover absolute" style={{ left: 56, top: 140, width: 500, ['--hw-label' as string]: glow || undefined }}>
          <div className="hw-vinyl" style={{ left: "54%" }} aria-hidden />
          <div className="hw-cover-art flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#003D27,#006644)' }}>
            {np?.art
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={np.art} alt="" className="absolute inset-0 w-full h-full object-cover" />
              : <div className="text-center"><p className="font-display text-br-brass/80 tracking-[0.2em]">Babson</p><p className="font-display text-white text-6xl tracking-[0.1em]">Radio</p></div>}
          </div>
          {onAirNow && <OnAirSign />}
        </div>

        {/* Title */}
        <div className="hw-panel absolute" style={{ position: 'absolute', left: 860, top: 232, width: 520, height: 460, padding: '48px 40px' }}>
          <FitTitle marquee={phone} as="div" text={hasSong ? np!.title : 'Babson Radio'} className="hw-board-title" />
          <div className="hw-board-sub">{hasSong ? sub : 'Live from campus'}</div>
          {hasSong && np!.next && <div className="hw-board-next">Next: {np!.next.title}{np!.next.artist ? ` · ${np!.next.artist}` : ''}</div>}
          <div className="hw-board-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hw/qr.svg" alt="QR code for babsonradio.com" width={116} height={116} />
            <div><strong>React to the stream:</strong><span>Scan to open babsonradio.com</span></div>
          </div>
        </div>

        {/* Equalizer */}
        <div className="hw-well hw-board-well absolute" style={{ left: 56, top: 736, width: 740, height: 110 }} aria-hidden>
          {showEq && (
            <div ref={eqRef} className="hw-eq hw-led hw-big-led" data-on={isPlaying}>
              {BOARD_BARS.map((b, i) => <i key={i} style={{ ['--h' as string]: b.h, animationDelay: `${b.d}s`, animationDuration: `${b.t}s` }} />)}
            </div>
          )}
        </div>

        {/* Reactions */}
        <div className="hw-panel hw-board-react absolute" style={{ position: 'absolute', left: 860, top: 736, width: 520, height: 110, padding: 0 }}>
          <ReactionKeys className="h-full !flex-nowrap !gap-4 px-5" />
        </div>

        {/* Pause and exit */}
        <div className={`absolute flex gap-3 transition-opacity duration-500 ${awake ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ right: 70, top: 24 }}>
          <button onClick={togglePlay} disabled={!canPlay} className="sk-key hw-pill hw-board-key">{isPlaying ? 'PAUSE' : 'PLAY'}</button>
          <button onClick={close} className="sk-key hw-pill hw-board-key">Exit</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
