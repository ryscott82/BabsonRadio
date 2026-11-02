'use client'

import { JOB_LABEL, isActive, progressPct, progressText, statusLine, type WorkerJob, type WorkerStatus } from '@/lib/libraryUi'

/** One strip: is the studio PC online, and what it is working on. It keeps its height while loading so the page below does not move. */
export default function StatusStrip({ status, jobs }: { status: WorkerStatus | null; jobs: WorkerJob[] | null }) {
  const current = jobs?.find(j => j.id === status?.currentJobId && isActive(j)) ?? jobs?.find(j => j.status === 'running')
  return (
    <section className="ops-card p-4 min-h-[104px] space-y-2" aria-label="Studio PC status" aria-live="polite">
      <p className="text-lg flex items-center gap-2">
        <span aria-hidden className={`inline-block w-3 h-3 rounded-full ${status?.online ? 'bg-white' : 'border-2 border-white/70'}`} />
        {status ? statusLine(status) : 'Checking the studio PC…'}
      </p>
      {current ? (
        <>
          <p className="text-base">{JOB_LABEL[current.type] ?? current.type}: {progressText(current)}</p>
          <div className="h-2.5 bg-black/35 rounded-full overflow-hidden" role="progressbar" aria-label="Job progress" aria-valuenow={progressPct(current)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-white" style={{ width: `${progressPct(current)}%` }} />
          </div>
        </>
      ) : (
        <p className="text-base opacity-90">{jobs ? 'No job is running.' : ' '}</p>
      )}
    </section>
  )
}
