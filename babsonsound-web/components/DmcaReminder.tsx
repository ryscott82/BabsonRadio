'use client'

import { useEffect, useState } from 'react'

/** Shown the first time a host opens the panel for a show. Remembered per show on this device. */
export default function DmcaReminder({ showKey }: { showKey: string | null }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!showKey) return
    let seen = false
    try { seen = localStorage.getItem(`br-dmca-${showKey}`) === '1' } catch { /* ignore */ }
    if (!seen) queueMicrotask(() => setOpen(true))
  }, [showKey])
  if (!open || !showKey) return null
  const close = () => {
    try { localStorage.setItem(`br-dmca-${showKey}`, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="dmca-title">
      <div className="sk-raised rounded-2xl p-6 sm:p-8 max-w-md w-full">
        <h2 id="dmca-title" className="font-display text-br-dk-text text-2xl mb-2">Before you go on air</h2>
        <p className="text-sm text-br-dk-sub mb-4">Copyright rules for internet radio. Following them keeps the station on the air.</p>
        <ul className="space-y-3 text-br-dk-text mb-6">
          <li><strong>No more than 3 songs by the same artist</strong> in one show.</li>
          <li><strong>Never 2 songs by the same artist back to back.</strong> Play something else in between.</li>
        </ul>
        <button type="button" onClick={close} className="sk-btn font-display tracking-[0.06em] text-sm px-8 py-3 rounded-xl w-full">I understand</button>
      </div>
    </div>
  )
}
