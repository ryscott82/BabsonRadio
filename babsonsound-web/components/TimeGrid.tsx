'use client'

import type { Day } from '@/lib/studioGrid'
import { timeLabel } from '@/lib/studioGrid'
import { LEVEL_CLASS, LEVEL_WORD } from '@/lib/hostFlow'

export type CellState = 'free' | 'taken' | 'past' | 'soon' | 'far'
export interface Cell { startMs: number; state: CellState; quiet?: boolean; level?: 0 | 1 | 2 | 3; pending?: boolean }

const STATE_WORD: Record<CellState, string> = { free: '', taken: 'Booked', past: 'Passed', soon: 'Too soon', far: 'Too far' }

/** Week arrows and the seven day buttons. A day list on every screen size: it never needs sideways scrolling. */
export function DayTabs({ days, dayKey, onDay, weekLabel, onPrev, onNext, canPrev, canNext }: {
  days: Day[]; dayKey: string; onDay: (key: string) => void; weekLabel: string
  onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean
}) {
  const arrow = 'sk-key rounded-lg w-11 h-11 text-lg text-br-dk-text disabled:opacity-40 shrink-0'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous week" className={arrow}>‹</button>
        <p className="flex-1 text-center text-base text-br-dk-text" aria-live="polite">{weekLabel}</p>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next week" className={arrow}>›</button>
      </div>
      <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1">
        {days.map(d => (
          <button key={d.key} type="button" role="tab" aria-selected={d.key === dayKey} onClick={() => onDay(d.key)}
                  className={`rounded-lg min-h-11 px-1 text-base leading-tight ${d.key === dayKey ? 'sk-key text-br-gold ring-1 ring-br-gold' : 'sk-field text-br-dk-text'}`}>
            {d.short.split(' ').map((p, i) => <span key={i} className="block">{p}</span>)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The blocks of one day. Tap a free block to choose it. Booked and passed blocks say so in words; quiet hours and popular times are shaded. */
export function BlockGrid({ cells, selected, onPick, showPopular, label = 'Times' }: {
  cells: Cell[]; selected: number | null; onPick: (ms: number) => void; showPopular?: boolean; label?: string
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {cells.map(c => {
        const free = c.state === 'free'
        const on = selected === c.startMs
        const level = showPopular && free ? c.level ?? 0 : 0
        const words = [STATE_WORD[c.state], c.pending ? 'requested' : '', c.quiet ? 'quiet hours' : '', level ? LEVEL_WORD[level] : ''].filter(Boolean).join(', ')
        return (
          <button key={c.startMs} type="button" disabled={!free} aria-pressed={free ? on : undefined}
                  aria-label={`${timeLabel(c.startMs)}${words ? `, ${words}` : ''}`}
                  onClick={() => onPick(c.startMs)}
                  className={`relative min-h-12 rounded-lg px-2 py-1 text-base text-left leading-tight border ${
                    on ? 'border-br-gold ring-2 ring-br-gold text-br-gold font-semibold'
                      : free ? 'border-br-dk-border text-br-dk-text'
                      : 'border-transparent text-br-dk-muted line-through decoration-1'} ${
                    free ? (c.quiet ? 'bg-sky-500/10' : level ? LEVEL_CLASS[level] : 'sk-field') : 'bg-br-dk-surface2/40'}`}>
            <span className="block">{timeLabel(c.startMs)}</span>
            {!free && <span className="block text-base no-underline" style={{ textDecoration: 'none' }}>{c.pending ? 'Requested' : STATE_WORD[c.state]}</span>}
            {free && c.quiet && <span className="block text-base text-br-dk-sub">Quiet</span>}
          </button>
        )
      })}
    </div>
  )
}

/** What the shading means, once, under the grid. */
export function GridLegend({ quiet, popular }: { quiet?: boolean; popular?: boolean }) {
  return (
    <p className="text-base text-br-dk-sub flex flex-wrap gap-x-5 gap-y-1">
      {quiet && <span><span className="inline-block w-3 h-3 rounded-sm bg-sky-500/30 align-middle mr-1.5" />Quiet hours</span>}
      {popular && <span><span className="inline-block w-3 h-3 rounded-sm bg-br-gold/35 align-middle mr-1.5" />Popular times (a hint, you can pick any time)</span>}
    </p>
  )
}
