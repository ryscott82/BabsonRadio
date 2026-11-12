'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * The "are you sure" box. Escape or Cancel closes it; focus starts on Cancel so Enter does not confirm by accident. The body must say who is affected.
 * `onYes` can be left out for a box that only reports (the Approve all results): then there is just a Close button.
 */
export default function ConfirmDialog({ title, body, action, busy = false, onNo, onYes, noLabel = 'Cancel', children }: {
  title: string; body?: string; action?: string; busy?: boolean; onNo: () => void; onYes?: () => void; noLabel?: string; children?: ReactNode
}) {
  const id = useId()
  const no = useRef<HTMLButtonElement>(null)
  useEffect(() => { no.current?.focus() }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onKeyDown={e => { if (e.key === 'Escape') onNo() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={body ? `${id}-b` : undefined} className="ops-card !bg-[#0f5233] p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
        <h4 id={`${id}-t`} className="text-2xl font-light">{title}</h4>
        {body && <p id={`${id}-b`} className="text-base">{body}</p>}
        {children}
        <div className="flex flex-wrap gap-3 justify-end">
          <button ref={no} type="button" className="ops-btn px-4 min-h-11" onClick={onNo}>{onYes ? noLabel : 'Close'}</button>
          {onYes && action && <button type="button" className="ops-btn-red px-4 min-h-11 disabled:opacity-50" disabled={busy} onClick={onYes}>{busy ? 'Working…' : action}</button>}
        </div>
      </div>
    </div>
  )
}
