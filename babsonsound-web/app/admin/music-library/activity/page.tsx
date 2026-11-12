'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import StatusStrip from '@/components/admin/library/StatusStrip'
import { useLibraryState } from '@/components/admin/library/useLibrary'
import { JOB_LABEL, ago, isActive, progressPct, progressText, type WorkerJob } from '@/lib/libraryUi'

const WORD: Record<WorkerJob['status'], string> = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' }

// Admin only. Recent jobs: status, progress, errors, and cancel.
export default function ActivityPage() {
  const { isAdmin, loading } = useAuth()
  const { status, jobs, next, error, reload, setJobs, setNext } = useLibraryState()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  if (loading || !isAdmin) return <div className="min-h-[60vh]" />

  async function cancel(id: string) {
    setBusy(id); setErr('')
    try { await api(`/api/admin/library/jobs/${encodeURIComponent(id)}/cancel`, {}); await reload() }
    catch (e) { setErr((e as Error).message) }
    setBusy('')
  }
  async function older() {
    if (next === null) return
    setBusy('more'); setErr('')
    try { const r = await apiGet<{ items: WorkerJob[]; next: number | null }>(`/api/admin/library/jobs?before=${next}`); setJobs(js => [...(js ?? []), ...r.items]); setNext(r.next) }
    catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  return (
    <div className="ops-hub">
      <div className="px-5 lg:px-8 py-8 space-y-6">
        <header>
          <h1 className="text-4xl font-light leading-tight">Activity</h1>
          <p className="text-base opacity-90 mt-1">Recent library jobs, newest first.</p>
        </header>
        <StatusStrip status={status} jobs={jobs} />
        <div className="min-h-[3.5rem]" aria-live="polite">{(err || error) && <p role="alert" className="ops-card p-3">{err || error}</p>}</div>

        <ul className="ops-card divide-y divide-white/25" aria-label="Jobs">
          {jobs === null && Array.from({ length: 4 }, (_, i) => <li key={i} className="p-4 min-h-[84px]" aria-hidden />)}
          {jobs?.map(j => (
            <li key={j.id} className="p-4 min-h-[84px] space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-lg flex-1 min-w-0">{JOB_LABEL[j.type] ?? j.type}</span>
                <span className="text-base">{WORD[j.status]}</span>
                <span className="text-sm opacity-80">{ago(j.finishedAt ?? j.startedAt ?? j.createdAt)}</span>
                {isActive(j) && <button type="button" className="ops-btn px-3 py-1.5" disabled={busy === j.id} onClick={() => cancel(j.id)}>Cancel</button>}
              </div>
              {(isActive(j) || j.status === 'done') && <p className="text-sm opacity-90">{progressText(j)}</p>}
              {j.status === 'running' && (
                <div className="h-2 bg-black/35 rounded-full overflow-hidden" role="progressbar" aria-label="Progress" aria-valuenow={progressPct(j)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-white" style={{ width: `${progressPct(j)}%` }} />
                </div>
              )}
              {j.error && <p className="text-base break-words">Error: {j.error}</p>}
            </li>
          ))}
          {jobs && !jobs.length && <li className="p-4">No jobs yet. Run one from the Music library page.</li>}
        </ul>
        {next !== null && <button type="button" className="ops-btn px-4 py-2" disabled={busy === 'more'} onClick={older}>Show older jobs</button>}
      </div>
    </div>
  )
}
