'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import StatusStrip from '@/components/admin/library/StatusStrip'
import { useLibraryState } from '@/components/admin/library/useLibrary'
import { JOB_LABEL, RUN_TYPES, busyTypes } from '@/lib/libraryUi'

const HELP: Record<string, string> = {
  'library.scan': 'Read the whole radio library.',
  'library.fetch_metadata': 'Look up better titles, artists and albums.',
  'library.fetch_art': 'Look up album covers.',
  'library.analyze_beats': 'Find the tempo and first beat of each song.',
  'library.measure_loudness': 'Measure how loud each song is.',
  'library.apply': 'Write the approved changes to the radio.',
  'library.undo': 'Put back what the last apply changed.',
}

// Admin only. Run the studio PC's library jobs, and go to the review queue and the activity list.
export default function MusicLibraryPage() {
  const { isAdmin, loading } = useAuth()
  const { status, jobs, error, reload } = useLibraryState()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [undo, setUndo] = useState<{ jobId: string; songs: number; more: boolean } | null>(null)

  if (loading || !isAdmin) return <div className="min-h-[60vh]" />
  const busyNow = busyTypes(jobs ?? [])
  const lastApply = jobs?.find(j => j.type === 'library.apply' && j.status === 'done')

  async function run(type: string, params?: Record<string, unknown>) {
    setBusy(type); setErr(''); setMsg('')
    try { await api('/api/admin/library/jobs', { type, params }); setMsg(`${JOB_LABEL[type]} is queued.`); setUndo(null); await reload() }
    catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  // Undo asks first: count the songs the last apply changed, then confirm.
  async function askUndo() {
    if (!lastApply) return
    setBusy('library.undo'); setErr(''); setMsg('')
    try {
      const songs = new Set<string>()
      let after: number | undefined, more = false
      for (let i = 0; i < 5; i++) {
        const r = await apiGet<{ items: { songId: string; undoOf?: string }[]; next: number | null }>(`/api/admin/library/changes?jobId=${encodeURIComponent(lastApply.id)}${after ? `&after=${after}` : ''}`)
        for (const c of r.items) if (!c.undoOf) songs.add(c.songId)
        if (r.next === null) break
        after = r.next
        if (i === 4) more = true
      }
      if (!songs.size) setMsg('The last apply changed nothing, so there is nothing to undo.')
      else setUndo({ jobId: lastApply.id, songs: songs.size, more })
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  const btn = 'ops-btn px-4 py-2 disabled:opacity-50 w-full text-left'
  return (
    <div className="ops-hub">
      <div className="px-5 lg:px-8 py-8 space-y-6">
        <header>
          <h1 className="text-4xl font-light leading-tight">Music library</h1>
          <p className="text-base opacity-90 mt-1">Clean up titles, covers, beats and loudness. The studio PC does the work.</p>
        </header>

        <StatusStrip status={status} jobs={jobs} />
        <div className="min-h-[3.5rem] space-y-2" aria-live="polite">
          {(err || error) && <p role="alert" className="ops-card p-3">{err || error}</p>}
          {msg && <p role="status" className="ops-card p-3">{msg}</p>}
        </div>

        <section className="space-y-3" aria-label="Run a job">
          <h2 className="text-2xl font-light">Run</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {RUN_TYPES.map(t => {
              const disabled = !!busy || busyNow.has(t) || (t === 'library.undo' && !lastApply)
              return (
                <div key={t} className="space-y-1">
                  {t === 'library.undo' && undo ? (
                    <div className="ops-card p-3 space-y-2">
                      <p>Undo the last apply? This puts back {undo.more ? 'at least ' : ''}{undo.songs} song{undo.songs === 1 ? '' : 's'}.</p>
                      <div className="flex gap-2">
                        <button type="button" className="ops-btn-red px-4 py-2" disabled={!!busy} onClick={() => run('library.undo', { jobId: undo.jobId })}>Undo {undo.songs} song{undo.songs === 1 ? '' : 's'}</button>
                        <button type="button" className="ops-btn px-4 py-2" onClick={() => setUndo(null)}>Keep changes</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className={btn} disabled={disabled} onClick={() => (t === 'library.undo' ? askUndo() : run(t))}>{JOB_LABEL[t]}</button>
                  )}
                  <p className="text-sm opacity-80 px-1">{busyNow.has(t) ? 'Already queued or running.' : t === 'library.undo' && !lastApply && jobs ? 'No finished apply to undo.' : HELP[t]}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3" aria-label="Pages">
          <h2 className="text-2xl font-light">Review and history</h2>
          <ul className="ops-card divide-y divide-white/25">
            <li><Link href="/admin/music-library/review" className="block p-4 no-underline"><span className="block text-xl">Review queue</span><span className="block text-base opacity-90">Approve, reject or edit proposed changes.</span></Link></li>
            <li><Link href="/admin/music-library/activity" className="block p-4 no-underline"><span className="block text-xl">Activity</span><span className="block text-base opacity-90">Recent jobs, errors and cancel.</span></Link></li>
          </ul>
        </section>
      </div>
    </div>
  )
}
