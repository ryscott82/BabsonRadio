'use client'

import { useMemo, useState } from 'react'
import { daysInMonth } from '@/lib/serverUsage'
import { enteredSeries, meterSeries, monthsOf, niceMax, ticks } from '@/lib/usageView'
import type { Overview } from '@/lib/server/serverUsage'
import LineChart, { type ChartSeries } from './LineChart'
import { fmtDay, fmtH, fmtMonth } from './format'

const DAY = 86_400_000

// Two charts: Active CPU hours through a month (with the allowance), and server time per listener-hour over time.
export default function Charts({ d }: { d: Overview }) {
  const months = useMemo(() => monthsOf(d.entries, d.month), [d.entries, d.month])
  const [month, setMonth] = useState(d.month)
  const cur = month === d.month
  const dim = daysInMonth(month)
  const allowance = d.allowanceHours

  const entered = useMemo(() => enteredSeries(month, d.entries), [month, d.entries])
  const perDay = useMemo(() => d.meter.byMonth[month] ?? {}, [d.meter.byMonth, month])
  const today = new Date(d.now).getUTCDate()
  const lastMeterDay = cur ? today : Math.max(0, ...Object.keys(perDay).map(Number))
  const offset = cur ? d.meter.baseHours : 0
  const meter = useMemo(() => (lastMeterDay > 0 ? meterSeries(month, perDay, offset, lastMeterDay) : []), [month, perDay, offset, lastMeterDay])
  const meterHasData = meter.some(p => p.hours > 0)

  const latest = entered[entered.length - 1]
  const proj = cur ? (latest ? d.forecast.fromEntry?.projectedMonthEnd : d.forecast.fromMeter.projectedMonthEnd) : undefined
  const from = latest ?? (meter.length ? meter[meter.length - 1] : undefined)
  const peak = Math.max(allowance * 1.15, ...entered.map(p => p.hours), ...meter.map(p => p.hours), proj ?? 0)
  const yMax = niceMax(peak)

  const series: ChartSeries[] = [
    { name: 'Active CPU entered from Vercel', color: '#ffffff', marker: true, pts: entered.map(p => ({ x: p.day, y: p.hours, tip: `${fmtDay(`${month}-${String(p.day).padStart(2, '0')}`)}: ${fmtH(p.hours)} h` })) },
    ...(meterHasData ? [{ name: 'Our meter (estimate)', color: '#9be7c4', dash: '7 5', pts: meter.map(p => ({ x: p.day, y: p.hours })) }] : []),
    ...(proj !== undefined && from ? [{ name: 'Projected month end', color: '#ffffff', dash: '2 5', width: 2, pts: [{ x: from.day, y: from.hours }, { x: dim, y: proj }] }] : []),
  ]
  const xt = Array.from({ length: dim }, (_, i) => i + 1).filter(n => n === 1 || n % 5 === 0).map(n => ({ v: n, label: String(n) }))

  // Server time per listener-hour: one point per reading.
  const pts = d.costs
  const cx = pts.map(p => Date.parse(`${p.toDate}T00:00:00Z`))
  const lo = cx.length ? Math.min(...cx) : 0, hi = cx.length ? Math.max(...cx) : 1
  const dom: [number, number] = lo === hi ? [lo - DAY, hi + DAY] : [lo - DAY / 2, hi + DAY / 2]
  const cy = niceMax(Math.max(0, ...pts.map(p => p.cpuSecondsPerListenerHour)) * 1.1)
  const n = Math.min(6, Math.max(1, cx.length))
  const cxt = Array.from(new Set(cx.length ? Array.from({ length: n }, (_, i) => cx[Math.round((i * (cx.length - 1)) / Math.max(1, n - 1))]) : [])).map(v => ({ v, label: fmtDay(new Date(v).toISOString().slice(0, 10)) }))
  const costSeries: ChartSeries[] = [{ name: 'Server seconds per listener-hour', color: '#ffffff', marker: true, pts: pts.map((p, i) => ({ x: cx[i], y: p.cpuSecondsPerListenerHour, tip: `${fmtDay(p.fromDate)} to ${fmtDay(p.toDate)}: ${Math.round(p.cpuSecondsPerListenerHour)} s per listener-hour (${(p.cpuHours / p.listenerHours).toFixed(4)} h)` })) }]
  const last = pts[pts.length - 1]

  const fe = d.forecast.fromEntry, fm = d.forecast.fromMeter
  const days = (v: number | null) => (v === null ? 'no end in sight at this rate' : v <= 0 ? 'already at the allowance' : `about ${Math.max(1, Math.round(v))} day${Math.round(v) === 1 ? '' : 's'} left`)

  return (
    <section className="space-y-3" aria-label="Charts">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-light">Charts</h2>
        {months.length > 1 && (
          <label className="flex items-center gap-2 ml-auto">Month
            <select className="ops-field py-1.5" value={month} onChange={e => setMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}</select>
          </label>
        )}
      </div>

      <div className="ops-card p-4 space-y-2">
        <h3 className="text-xl">Active CPU hours in {fmtMonth(month)}</h3>
        <p className="opacity-90">Each reading adds up through the month. The line is the allowance.</p>
        <LineChart series={series} xDomain={[1, dim]} xTicks={xt} yMax={yMax} yTicks={ticks(yMax)} yFormat={v => fmtH(v)} refLine={{ y: allowance, label: `Allowance ${fmtH(allowance)} h` }}
          aria={`Active CPU hours through ${fmtMonth(month)}. ${entered.length ? `Latest reading ${fmtH(entered[entered.length - 1].hours)} of ${fmtH(allowance)} hours.` : 'No readings yet.'}`} empty="No readings for this month yet." />
        {cur && (
          <ul className="space-y-1">
            {fe && <li>From the {fmtDay(fe.date)} reading: month end about {fmtH(fe.projectedMonthEnd)} h, {days(fe.daysUntilExhausted)}.</li>}
            <li>From our meter: month end about {fmtH(fm.projectedMonthEnd)} h, {days(fm.daysUntilExhausted)}.</li>
          </ul>
        )}
      </div>

      <div className="ops-card p-4 space-y-2">
        <h3 className="text-xl">Server time per listener-hour</h3>
        <p className="opacity-90">Each point is the Active CPU added since the reading before it, divided by the hours people listened in that stretch. Lower is better.</p>
        <LineChart series={costSeries} xDomain={dom} xTicks={cxt} yMax={cy} yTicks={ticks(cy)} yFormat={v => `${Math.round(v * 10) / 10}s`}
          aria={last ? `Server seconds per listener-hour over time. Latest ${Math.round(last.cpuSecondsPerListenerHour)} seconds.` : 'Server seconds per listener-hour over time. No points yet.'}
          empty="Needs two readings with listening between them." />
        {last && <p>Latest: {Math.round(last.cpuSecondsPerListenerHour)} seconds ({(last.cpuHours / last.listenerHours).toFixed(4)} hours) of server time per listener-hour, {fmtDay(last.fromDate)} to {fmtDay(last.toDate)}.</p>}
      </div>
    </section>
  )
}
