'use client'

import { useState } from 'react'
import { canCopyEmail, hostLine, studentShows, type NextRow } from '@/lib/todayPage'

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const day = (ms: number) => {
  const d = new Date(ms), t = new Date(), tm = new Date(t.getTime() + 86_400_000)
  if (d.toDateString() === t.toDateString()) return 'Today'
  if (d.toDateString() === tm.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

/**  time, title, host name, and a Copy email button for shows booked through a request. Nothing else about the host is shown. */
export default function ComingUp({ rows: all }: { rows: NextRow[] | null }) {
  const rows = all ? studentShows(all) : null
  const [copied, setCopied] = useState('')
  async function copy(i: number, email: string) {
    try { await navigator.clipboard.writeText(email); setCopied(`Copied the email for ${rows?.[i]?.title ?? 'the host'}.`) }
    catch { setCopied('Could not copy. Select it and copy by hand.') }
  }
  return (
    <section className="ops-card p-5 min-h-[10rem] min-w-0 lg:h-full lg:flex lg:flex-col" aria-label="Coming up" aria-busy={!rows}>
      <h2 className="text-2xl font-light mb-2">Coming up</h2>
      {!rows && <div className="space-y-3 py-1" aria-hidden><div className="h-6 w-full bg-white/25 motion-safe:animate-pulse" /><div className="h-6 w-5/6 bg-white/25 motion-safe:animate-pulse" /></div>}
      {rows && (
        <ul className="text-base divide-y divide-white/25 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          {rows.map((n, i) => (
            <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular-nums w-56 shrink-0 opacity-90">{day(n.startAt)}, {clock(n.startAt)} – {clock(n.endAt)}</span>
              <span className="min-w-0 flex-1 basis-40">{n.title}{hostLine(n) ? <span className="opacity-90"> · {hostLine(n)}</span>  : null}</span>
              {canCopyEmail(n) && <button type="button" className="ops-btn px-3 min-h-11" onClick={() => copy(i, n.hostEmail as string)}>Copy email</button>}
            </li>
          ))}
          {!rows.length && <li className="py-2">No student shows coming up.</li>}
        </ul>
      )}
      <p role="status" className="text-base min-h-6">{copied}</p>
    </section>
  )
}
