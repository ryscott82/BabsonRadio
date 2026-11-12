'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import type { Overview, UsageRow } from '@/lib/server/serverUsage'
import AlertHistory from '@/components/admin/usage/AlertHistory'
import Charts from '@/components/admin/usage/Charts'
import EntryForm from '@/components/admin/usage/EntryForm'
import FeatureImpact from '@/components/admin/usage/FeatureImpact'
import History from '@/components/admin/usage/History'
import Instructions from '@/components/admin/usage/Instructions'
import RouteTable from '@/components/admin/usage/RouteTable'
import TierPanel from '@/components/admin/usage/TierPanel'
import { fmtWhen } from '@/components/admin/usage/format'
import SettingsBox from '@/components/admin/SettingsBox'

// Admin only. Server time on Vercel (Active CPU): how to read Vercel's numbers, a log of readings typed in from it, charts, the forecast, which
// features are slowed or off (with a lock per tier), what each feature costs, and the alert history.
// It loads once when opened and again only when Refresh is pressed or something is saved: this page must not use server time itself.
// Everything arrives in one call (/api/admin/server-usage/overview).
const cpuKeys = (k: string) => k.startsWith('cpu.')

export default function ServerLoadPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<UsageRow | null>(null)
  const [focus] = useState(() => { try { return new URLSearchParams(window.location.search).get('focus') ?? '' } catch { return '' } })

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const r = await apiGet<Overview>('/api/admin/server-usage/overview')
      setD(r)
      window.dispatchEvent(new CustomEvent('usage-status', { detail: r.status })) // the banner on every admin page uses the fresh numbers
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.') }
    setBusy(false)
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const changed = async (m: string) => { setMsg(m); setEditing(null); await load() }

  return (
    <div>
      <div className="max-w-[1100px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex-1 min-w-[240px]">
            <h1 className="text-4xl font-light leading-tight">Server load</h1>
            <p className="text-base opacity-90 mt-1">How much of Vercel&apos;s monthly server time the site has used, and what is slowed to save it.</p>
          </div>
          <div className="flex items-center gap-3">
            {d && <span className="text-sm opacity-90">Loaded {fmtWhen(d.now)}</span>}
            <button type="button" className="ops-btn px-4 py-2 disabled:opacity-60" onClick={() => { setMsg(''); load() }} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </header>

        <div className="min-h-[3.5rem] space-y-2" aria-live="polite">
          {error && (
            <div role="alert" className="ops-card p-3 flex flex-wrap items-center gap-3"><span className="flex-1 min-w-[200px]">{error}</span><button type="button" className="ops-btn px-4 py-2" onClick={() => load()}>Try again</button></div>
          )}
          {msg && !error && <p role="status" className="ops-card p-3">{msg}</p>}
        </div>

        <SettingsBox accept={cpuKeys} focus={focus} onSaved={() => load()} />

        <Instructions />

        {!d && !error && Array.from({ length: 3 }, (_, i) => <div key={i} className="ops-card min-h-[180px] p-4" aria-hidden>{i === 0 ? 'Loading…' : ''}</div>)}
        {d && (
          <>
            <TierPanel d={d} onChanged={changed} />
            <EntryForm key={editing?.id ?? 'new'} entries={d.entries} editing={editing} onDone={changed} onCancel={() => setEditing(null)} />
            <Charts d={d} />
            <History d={d} onEdit={setEditing} onChanged={changed} />
            <FeatureImpact d={d} />
            <AlertHistory alerts={d.alerts} />
            <RouteTable d={d} />
          </>
        )}
      </div>
    </div>
  )
}
