import type { Overview } from '@/lib/server/serverUsage'
import { fmtH, fmtWhen } from './format'

type A = Overview['alerts'][number]
const what = (a: A) => (a.kind === 'projected' ? 'Forecast passes the allowance' : `${a.pct}% of the allowance`)
const how = (a: A) => (a.silent ? 'Counted, no email (a higher step was announced)' : a.emailed ? `Email sent${a.emailedTo ? ` to ${a.emailedTo}` : ''}` : 'No email went out (mail is not set up, or sending failed)')

// When usage alerts were raised and whether an email went out through Resend. The last 3 months.
export default function AlertHistory({ alerts }: { alerts: A[] }) {
  const rows = [...alerts].sort((a, b) => b.at - a.at)
  return (
    <section className="space-y-3" aria-label="Alert history">
      <h2 className="text-2xl font-light">Alerts and emails</h2>
      <ul className="ops-card divide-y divide-white/25">
        {rows.map(a => (
          <li key={a.id} className="p-4 grid gap-x-4 gap-y-0.5 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)]">
            <span className="opacity-90">{fmtWhen(a.at)}</span>
            <span className="text-lg">{what(a)} <span className="text-base opacity-90">({fmtH(a.hours)} of {fmtH(a.allowance)} h, from {a.source === 'entry' ? 'an entered reading' : 'our meter'})</span></span>
            <span>{how(a)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-4">No alerts in the last 3 months.</li>}
      </ul>
      <p className="text-sm opacity-90">Each step (50, 75, 90 and 100%) is announced once a month. Emails go to the owners and every admin.</p>
    </section>
  )
}
