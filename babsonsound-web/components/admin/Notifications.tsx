'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'

export interface Notice { key: string; kind: string; title: string; detail: string[]; at: number; href?: string; hrefLabel?: string }
interface LogEntry { key: string; kind: string; title: string; detail: string[]; at: number; href: string; dismissedAt: number; dismissedByName: string; restored: boolean }

const when = (ms: number) => {
  if (!ms) return ''
  const m = Math.round((Date.now() - ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// The Notifications card on the admin home. Click a row for details, dismiss it when it has been dealt with.
// Dismissed ones move to the second tab, which keeps a log of who cleared what and when.
export default function Notifications({ items, dismissedCount, reload }: { items: Notice[]; dismissedCount: number; reload: () => void }) {
  const [tab, setTab] = useState<'new' | 'log'>('new')
  const [open, setOpen] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set()) // hidden right away, before the server round trip finishes
  const [log, setLog] = useState<LogEntry[] | null>(null)
  const [err, setErr] = useState('')

  const shown = items.filter(n => !gone.has(n.key))
  const loadLog = useCallback(() => { apiGet<{ log: LogEntry[] }>('/api/admin/alerts?log=1').then(r => setLog(r.log ?? [])).catch(() => setErr('Could not load the log. Try again.')) }, [])
  useEffect(() => { if (tab === 'log') loadLog() }, [tab, loadLog])

  async function dismiss(keys: string[]) {
    setErr('')
    setGone(g => new Set([...g, ...keys]))
    try { await api('/api/admin/alerts', { action: 'dismiss', keys }); reload() }
    catch { setGone(g => { const n = new Set(g); keys.forEach(k => n.delete(k)); return n }); setErr('Could not dismiss that. Try again.') }
  }
  async function restore(key: string) {
    setErr('')
    try {
      await api('/api/admin/alerts', { action: 'restore', key })
      setGone(g => { const n = new Set(g); n.delete(key); return n })
      loadLog(); reload()
    } catch { setErr('Could not restore that. Try again.') }
  }

  const row = 'py-2 text-base'
  const tabBtn = (id: 'new' | 'log', label: string) => (
    <button type="button" onClick={() => setTab(id)}
      className="ops-btn px-4 py-1.5" aria-pressed={tab === id}>{label}</button>
  )

  return (
    <section className="ops-card p-5" aria-label="Notifications">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h2 className="text-2xl font-light mr-auto">Notifications</h2>
        <div role="group" aria-label="Notification lists" className="flex gap-2">
          {tabBtn('new', `New${shown.length ? ` (${shown.length})` : ''}`)}
          {tabBtn('log', `Dismissed${dismissedCount ? ` (${dismissedCount})` : ''}`)}
        </div>
      </div>
      {err && <p role="alert" className="text-base font-semibold py-1">{err}</p>}

      {tab === 'new' && (
        <>
          {shown.length === 0 && <p className="text-base py-1">Nothing needs attention.</p>}
          <ul className="divide-y divide-white/25">
            {shown.map(n => {
              const isOpen = open === n.key
              return (
                <li key={n.key} className={row}>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : n.key)}
                      className={`text-left min-w-0 flex-1 ${n.kind === 'deadair' ? 'font-semibold' : ''}`}>
                      <span className="block truncate">{n.title}</span>
                      <span className="block text-sm opacity-80">{when(n.at)} · {isOpen ? 'Hide details' : 'Show details'}</span>
                    </button>
                    <button type="button" onClick={() => dismiss([n.key])} className="ops-btn px-4 py-1.5 shrink-0" aria-label={`Dismiss: ${n.title}`}>Dismiss</button>
                  </div>
                  {isOpen && (
                    <div className="mt-2 pl-1 space-y-1 text-base">
                      {n.detail.map((d, i) => <p key={i} className="whitespace-pre-wrap break-words">{d}</p>)}
                      {n.href && <Link href={n.href} className="inline-block ops-btn px-4 py-1.5 mt-1">{n.hrefLabel ?? 'Open'}</Link>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {shown.length > 1 && (
            <div className="pt-3"><button type="button" onClick={() => dismiss(shown.map(n => n.key))} className="ops-btn px-4 py-1.5">Dismiss all</button></div>
          )}
        </>
      )}

      {tab === 'log' && (
        <>
          <p className="text-sm opacity-90 pb-1">Everything that has been dismissed, newest first. Restore brings one back to New.</p>
          {log === null && !err && <p className="text-base py-1">Loading…</p>}
          {log?.length === 0 && <p className="text-base py-1">Nothing dismissed yet.</p>}
          <ul className="divide-y divide-white/25">
            {(log ?? []).map(e => {
              const isOpen = open === `log-${e.key}`
              return (
                <li key={e.key} className={row}>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `log-${e.key}`)} className="text-left min-w-0 flex-1">
                      <span className="block truncate">{e.title}</span>
                      <span className="block text-sm opacity-80">
                        {e.restored ? 'Restored' : `Dismissed ${when(e.dismissedAt)}${e.dismissedByName ? ` by ${e.dismissedByName}` : ''}`} · {isOpen ? 'Hide details' : 'Show details'}
                      </span>
                    </button>
                    {!e.restored && <button type="button" onClick={() => restore(e.key)} className="ops-btn px-4 py-1.5 shrink-0">Restore</button>}
                  </div>
                  {isOpen && (
                    <div className="mt-2 pl-1 space-y-1 text-base">
                      {e.detail.map((d, i) => <p key={i} className="whitespace-pre-wrap break-words">{d}</p>)}
                      <p className="text-sm opacity-80">Happened {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                      {e.href && <Link href={e.href} className="inline-block ops-btn px-4 py-1.5 mt-1">Open</Link>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
