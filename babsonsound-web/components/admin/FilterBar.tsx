'use client'

import { useMemo, useState, type ReactNode } from 'react'

/** Every word typed must appear somewhere in the text (any order, any case). */
export function matchAll(text: string, q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const t = text.toLowerCase()
  return words.every(w => t.includes(w))
}

/**
 * Search box plus optional filters for a long list.
 *   const f = useFilter(rows, r => `${r.name} ${r.email}`)       // text search
 *   <FilterBar f={f} total={rows.length}>{filter dropdowns}</FilterBar>
 *   f.items = rows that match the search (apply your own filters on top, then page with usePaged)
 */
export function useFilter<T>(rows: T[], text: (r: T) => string) {
  const [q, setQ] = useState('')
  const items = useMemo(() => rows.filter(r => matchAll(text(r), q)), [rows, q, text])
  return { q, setQ, items }
}

/** Show a long list in steps so thousands of rows stay fast. */
export function usePaged<T>(rows: T[], step = 100) {
  const [n, setN] = useState(step)
  const more = rows.length > n
  return { items: rows.slice(0, n), more, showMore: () => setN(v => v + step), remaining: Math.max(0, rows.length - n), reset: () => setN(step) }
}

export function MoreButton({ p }: { p: { more: boolean; showMore: () => void; remaining: number } }) {
  if (!p.more) return null
  return <button type="button" onClick={p.showMore} className="sk-key px-4 py-2 text-sm">Show more ({p.remaining} left)</button>
}

/** The bar itself: search field, filter controls (children) and "x of y". */
export default function FilterBar({ f, total, shown, placeholder = 'Search', children }: {
  f: { q: string; setQ: (v: string) => void; items: unknown[] }; total: number; shown?: number; placeholder?: string; children?: ReactNode
}) {
  const n = shown ?? f.items.length
  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <input type="search" value={f.q} onChange={e => f.setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
             className="sk-field flex-1 min-w-[12rem] px-3 py-2 text-sm text-br-dk-text" />
      {children}
      <span className="text-sm text-br-dk-sub tabular-nums shrink-0" role="status">{n === total ? `${total}` : `${n} of ${total}`}</span>
    </div>
  )
}

/** A dropdown filter that fits the bar. */
export function Pick({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="sk-field px-3 py-2 text-sm text-br-dk-text">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
