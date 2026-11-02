'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/auth'
import type { WorkerJob, WorkerStatus } from '@/lib/libraryUi'

/**
 * The studio PC's status and the latest jobs. Read once when the page opens and again after actions (call reload).
 * Only while a job is running and the page is visible does it check again, every 10 seconds; coming back to the tab reads once more.
 */
export function useLibraryState() {
  const [status, setStatus] = useState<WorkerStatus | null>(null)
  const [jobs, setJobs] = useState<WorkerJob[] | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([
        apiGet<WorkerStatus>('/api/admin/library/status'),
        apiGet<{ items: WorkerJob[]; next: number | null }>('/api/admin/library/jobs'),
      ])
      if (!alive.current) return
      setStatus(s); setJobs(j.items); setNext(j.next); setError('')
    } catch (e) { if (alive.current) setError((e as Error).message) }
  }, [])

  useEffect(() => { queueMicrotask(reload) }, [reload])

  const running = !!jobs?.some(j => j.status === 'running')
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => { if (!document.hidden) reload() }, 10_000)
    return () => clearInterval(t)
  }, [running, reload])
  useEffect(() => {
    const back = () => { if (!document.hidden) reload() }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [reload])

  return { status, jobs, next, error, reload, setJobs, setNext, running }
}
