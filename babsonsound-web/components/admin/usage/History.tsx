'use client'

import { useMemo, useState } from 'react'
import { api } from '@/lib/auth'
import { meterAt } from '@/lib/usageView'
import type { Overview, UsageRow } from '@/lib/server/serverUsage'
import { fmtDay, fmtH, fmtInt, fmtWhen } from './format'

const TH = 'text-left font-normal px-3 py-2'
const TD = 'flex justify-between gap-4 px-3 py-1.5 before:content-[attr(data-label)] before:opacity-80 before:text-base before:self-center lg:before:hidden lg:table-cell lg:align-top'

// Every reading, newest first, with our own meter beside it so the gap is visible. Change and delete are here.
export default function History({ d, onEdit, onChanged }: { d: Overview; onEdit: (e: UsageRow) => void; onChanged: (msg: string) => void }) {
  const [all, setAll] = useState(false)
  const [ask, setAsk] = useState<string | null>(null) // the entry waiting for a second click on Delete
  const [busy, setBusy] = useState('')
  const [fail, setFail] = useState('')

  const withMeter = useMemo(() => d.entries.map(e => {
    const m = meterAt(e.date, d.meter.byMonth[e.date.slice(0, 7)], e.date.slice(0, 7) === d.month ? d.meter.baseHours : 0)
    return { e, meter: m }
  }), [d])
  const rows = all ? withMeter : withMeter.slice(0, 12)
  const pairs = withMeter.filter(r => r.meter !== null && r.meter > 0 && r.e.activeCpuHours !== null && r.e.activeCpuHours > 0)
  const ratio = pairs.length >= 2 ? pairs.reduce((a, r) => a + (r.meter as number), 0) / pairs.reduce((a, r) => a + (r.e.activeCpuHours as number), 0) : null

  async function del(id: string, date: string) {
    setBusy(id); setFail('')
    try { await api('/api/admin/server-usage', { action: 'delete', id }); setAsk(null); onChanged(`Deleted the ${fmtDay(date)} reading.`) }
    catch (x) { setFail(x instanceof Error ? x.message : 'Could not delete.') }
    setBusy('')
  }

  return (
    <section className="space-y-2" aria-label="History">
      <h2 className="text-2xl font-light">History</h2>
      <div aria-live="polite" className="min-h-[1.5rem]">{fail && <p role="alert" className="ops-card p-3">{fail}</p>}</div>
      <div className="ops-card">
        <table className="w-full">
          <thead className="hidden lg:table-header-group border-b border-white/25">
            <tr><th className={TH}>Date</th><th className={TH}>Active CPU (h)</th><th className={TH}>Our meter (h)</th><th className={TH}>Gap (h)</th><th className={TH}>Edge requests</th><th className={TH}>Invocations</th><th className={TH}>Data (GB)</th><th className={TH}>Entered by</th><th className={TH}>Notes</th><th className={TH}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="block lg:table-row-group">
            {rows.map(({ e, meter }) => (
              <tr key={e.id} className="block lg:table-row border-b border-white/25 last:border-0 py-2 lg:py-0">
                <td data-label="Date" className={`${TD} text-lg`}>{fmtDay(e.date)} <span className="lg:hidden opacity-80 text-base">{e.date.slice(0, 4)}</span></td>
                <td data-label="Active CPU (h)" className={`${TD} tabular-nums`}>{e.activeCpuHours === null ? '' : fmtH(e.activeCpuHours)}</td>
                <td data-label="Our meter (h)" className={`${TD} tabular-nums`}>{meter === null || e.activeCpuHours === null ? (meter === null ? 'not counted' : '') : fmtH(meter)}</td>
                <td data-label="Gap (h)" className={`${TD} tabular-nums`}>{meter === null || e.activeCpuHours === null ? '' : `${e.activeCpuHours - meter >= 0 ? '+' : '−'}${fmtH(Math.abs(e.activeCpuHours - meter))}`}</td>
                <td data-label="Edge requests" className={`${TD} tabular-nums`}>{e.edgeRequests === null ? '' : fmtInt(e.edgeRequests)}</td>
                <td data-label="Invocations" className={`${TD} tabular-nums`}>{e.functionInvocations === null ? '' : fmtInt(e.functionInvocations)}</td>
                <td data-label="Data (GB)" className={`${TD} tabular-nums`}>{e.fastDataTransferGB === null ? '' : fmtH(e.fastDataTransferGB)}</td>
                <td data-label="Entered by" className={TD}><span className="break-all lg:text-base">{e.enteredBy || 'unknown'}<span className="block text-base opacity-80">{fmtWhen(e.enteredAt)}</span></span></td>
                <td data-label="Notes" className={`${TD} lg:min-w-[160px]`}>
                  <span className="text-right lg:text-left break-words">
                    {e.topRoutes?.length ? <span className="block text-base opacity-90">{e.topRoutes.map(r => `${r.route} ${fmtH(r.cpuHours)} h`).join(', ')}</span> : null}
                    {e.note}
                  </span>
                </td>
                <td className="flex flex-wrap gap-2 px-3 py-1.5 lg:table-cell lg:whitespace-nowrap lg:align-top">
                  <button type="button" className="ops-btn px-3 py-1.5" onClick={() => onEdit(e)}>Change</button>
                  {ask === e.id
                    ? (<>
                      <button type="button" className="ops-btn-red px-3 py-1.5" disabled={busy === e.id} onClick={() => del(e.id, e.date)}>Delete for good</button>
                      <button type="button" className="ops-btn px-3 py-1.5" onClick={() => setAsk(null)}>Keep</button>
                    </>)
                    : <button type="button" className="ops-btn px-3 py-1.5" onClick={() => setAsk(e.id)}>Delete</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr className="block lg:table-row"><td colSpan={10} className="block lg:table-cell p-4">No readings yet. Use the form above to add the first one.</td></tr>}
          </tbody>
        </table>
      </div>
      {d.entries.length > 12 && <button type="button" className="ops-btn px-4 py-2" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${d.entries.length}`}</button>}
      <p className="text-base opacity-90">
        Gap is the entered number minus our meter on that day. A plus means Vercel counted more than we did.
        {ratio !== null && ` Across these readings our meter has counted about ${Math.round(ratio * 100)}% of what Vercel shows.`}
      </p>
    </section>
  )
}
