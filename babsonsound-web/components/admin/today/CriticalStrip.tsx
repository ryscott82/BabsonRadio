import Link from 'next/link'
import { criticalLines, type Critical } from '@/lib/todayPage'

/** Renders nothing unless the dashboard's `critical` object says something is wrong. One red line per problem, with a link when the person may open it. */
export default function CriticalStrip({ critical, role }: { critical: Critical | null | undefined; role: 'director' | 'admin' }) {
  const lines = criticalLines(critical, role)
  if (!lines.length) return null
  return (
    <div role="alert" className="bg-[#b3261f] text-white border-2 border-white p-4 space-y-1">
      {lines.map(l => (
        <p key={l.text} className="text-lg flex flex-wrap items-center gap-x-4 gap-y-1">
          <span aria-hidden>■</span><span>{l.text}</span>
          {l.href && <Link href={l.href} className="underline underline-offset-4 min-h-11 inline-flex items-center">Open it</Link>}
        </p>
      ))}
    </div>
  )
}
