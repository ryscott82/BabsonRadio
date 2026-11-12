'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/auth'
import { describeChange, hasMore, historyUrl, mergePage, type HistoryLine, type HistoryPage } from '@/lib/settingsHistory'

/** Who changed which setting and when, newest first. Loads only when opened (and again after a save while it is open); "Show older" pages back. */
export default function SettingsHistory({ reloadKey, labelOf }: { reloadKey: number; labelOf: (key: string) => string | undefined }) {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<HistoryLine[] | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const first = useCallback(async () => {
    setBusy(true); setErr('')
    try { const p = await apiGet<HistoryPage>(historyUrl(null)); setLines(p.lines); setNext(p.next) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the history.') }
    setBusy(false)
  }, [])
  const older = useCallback(async () => {
    if (next === null) return
    setBusy(true); setErr('')
    try { const p = await apiGet<HistoryPage>(historyUrl(next)); setLines(cur => mergePage(cur ?? [], p)); setNext(p.next) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load older changes.') }
    setBusy(false)
  }, [next])

  useEffect(() => { if (open) queueMicrotask(first) }, [open, reloadKey, first])

  return (
    <section aria-label="History" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-light flex-1 min-w-[160px]">History</h2>
        <button type="button" className="ops-btn px-4 min-h-11" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide history' : 'Show history'}</button>
      </div>
      {open && (
        <div className="ops-card p-4 space-y-3" aria-busy={busy}>
          {err && <p role="alert" className="text-base font-semibold">{err}</p>}
          {!lines && !err && <div className="space-y-3" aria-hidden><div className="h-6 w-full bg-white/25 motion-safe:animate-pulse" /><div className="h-6 w-5/6 bg-white/25 motion-safe:animate-pulse" /></div>}
          {lines?.length === 0 && <p className="text-base">Nothing has been changed here yet.</p>}
          <ul className="divide-y divide-white/25">
            {(lines ?? []).map(l => (
              <li key={l.id} className="py-2 text-base">
                <span className="block font-semibold">{labelOf(l.key) ?? l.label}</span>
                <span className="block">{describeChange(l)}</span>
                <span className="block opacity-90">{l.by} · {new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
          {lines && hasMore(next) && <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-60" disabled={busy} onClick={older}>{busy ? 'Loading…' : 'Show older'}</button>}
        </div>
      )}
    </section>
  )
}
