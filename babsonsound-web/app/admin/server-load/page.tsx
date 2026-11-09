'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import type { CpuMinute, RouteTotal } from '@/lib/cpuMeterCore'

interface Data { note: string; totals: RouteTotal[]; minutes: CpuMinute[]; tokenCache: { hits: number; misses: number } }

// Which routes use the most server time (Vercel Active CPU) and how many Firestore reads they make, for the last hour on one server instance.
export default function ServerLoadPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    setError('')
    try { setD(await apiGet<Data>('/api/admin/cpu-meter')) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const total = d ? d.totals.reduce((a, r) => a + r.cpuMs, 0) : 0
  const asked = d ? d.tokenCache.hits + d.tokenCache.misses : 0
  const perMin = d && d.minutes.length ? d.minutes.slice(0, 15) : []
  const maxMin = Math.max(1, ...perMin.map(m => m.totalCpuMs))
  return (
    <div className="min-h-screen">
      <div className="max-w-[1100px] mx-auto px-5 lg:px-10 py-6 space-y-5">
        <div className="flex items-baseline gap-3 border-b border-br-dk-border pb-3">
          <Link href="/admin" className="text-br-dk-sub text-xs">admin panel</Link>
          <h1 className="text-br-dk-text text-base font-semibold">server load</h1>
          <button onClick={load} className="ml-auto rounded-md border border-br-dk-border px-3 py-1.5 text-xs text-br-dk-text hover:text-br-gold">Refresh</button>
        </div>
        {error && <p className="text-sm text-br-red">{error}</p>}
        {d && (
          <>
            <p className="text-xs text-br-dk-sub">{d.note} The bill itself is on Vercel: Usage, Fluid Active CPU, by route.</p>
            <div className="sk-raised p-4 overflow-x-auto">
              <p className="text-sm text-br-dk-text mb-2">By route, last hour <span className="text-br-dk-sub">({(total / 1000).toFixed(1)} s of server time in all)</span></p>
              <table className="w-full text-xs text-br-dk-sub">
                <thead><tr className="text-left"><th className="font-normal">Route</th><th className="font-normal text-right">Calls</th><th className="font-normal text-right">Server time (s)</th><th className="font-normal text-right">Share</th><th className="font-normal text-right">Avg per call (ms)</th><th className="font-normal text-right">Worst call (ms)</th><th className="font-normal text-right">Firestore reads</th></tr></thead>
                <tbody>
                  {d.totals.map(r => (
                    <tr key={r.route}>
                      <td className="text-br-dk-text break-all">{r.route}</td>
                      <td className="text-right tabular-nums">{r.requests}</td>
                      <td className="text-right tabular-nums">{(r.cpuMs / 1000).toFixed(2)}</td>
                      <td className="text-right tabular-nums">{total ? Math.round((r.cpuMs / total) * 100) : 0}%</td>
                      <td className="text-right tabular-nums">{r.avgCpuMs}</td>
                      <td className="text-right tabular-nums">{r.maxCpuMs}</td>
                      <td className="text-right tabular-nums">{r.reads}</td>
                    </tr>
                  ))}
                  {d.totals.length === 0 && <tr><td colSpan={7}>Nothing has run on this server instance in the last hour.</td></tr>}
                </tbody>
              </table>
            </div>
            {perMin.length > 0 && (
              <div className="sk-raised p-4">
                <p className="text-xs text-br-dk-sub mb-2">Server time per minute, newest first (ms)</p>
                <div className="space-y-1">
                  {perMin.map(m => (
                    <div key={m.minute} className="flex items-center gap-3 text-xs text-br-dk-sub">
                      <span className="w-28 tabular-nums">{m.minute.slice(11)} UTC</span>
                      <div className="h-2 rounded-full bg-br-dk-border overflow-hidden flex-1"><div className="h-full bg-br-gold" style={{ width: `${(m.totalCpuMs / maxMin) * 100}%` }} /></div>
                      <span className="w-16 text-right tabular-nums">{Math.round(m.totalCpuMs)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-br-dk-sub">
              Sign-in checks remembered by this instance: {d.tokenCache.hits} of {asked} calls{asked ? ` (${Math.round((d.tokenCache.hits / asked) * 100)}%)` : ''} skipped the signature check.
              Calls that Vercel answers from its cache (the shared half of the live page) never reach a server, so they are not counted here.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
