'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import SettingRow from '@/components/admin/SettingRow'
import { loadAll, saveOne, type Values } from '@/components/admin/settings/sources'
import { changedOnly, settingMatches, type SettingTier, type SettingValue } from '@/lib/settingRow'
import { SETTINGS, TIER_INFO, byId } from '@/lib/settingsDefs'

const TIERS: SettingTier[] = ['everyday', 'customize', 'defaults']

// Admin only. Every setting in one place, in three stacked sections: Everyday (open), Customize (collapsed), and Defaults and safety (behind
// "Show advanced settings"). Each row shows the value now, the default, a Changed badge, Reset to default, and a confirm step for values that
// can hurt every listener. It reads the existing settings endpoints once when opened (no polling) and saves through the same endpoints.
export default function SettingsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [values, setValues] = useState<Values | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [open, setOpen] = useState<Record<SettingTier, boolean>>({ everyday: true, customize: false, defaults: false })
  const [focus] = useState(() => { try { return new URLSearchParams(window.location.search).get('focus') ?? '' } catch { return '' } }) // from a search result in the admin menu
  const focusTier = byId(focus)?.tier

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    setBusy(true)
    const r = await loadAll()
    setValues(r.values); setFailed(r.failed)
    setBusy(false)
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  const filtering = query.trim() !== '' || onlyChanged
  const rows = useMemo(() => {
    const all = SETTINGS.filter(s => settingMatches(s, query)).map(def => ({ def, value: values?.[def.id] }))
    return onlyChanged ? changedOnly(all) : all
  }, [query, onlyChanged, values])
  const totalChanged = useMemo(() => changedOnly(SETTINGS.map(def => ({ def, value: values?.[def.id] }))).length, [values])

  const save = useCallback(async (id: string, v: SettingValue) => {
    const fresh = await saveOne(id, v)
    setValues(cur => ({ ...(cur ?? {}), ...fresh }))
  }, [])

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const field = 'ops-field w-full sm:w-80 min-h-11'

  return (
    <div className="max-w-[1100px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-4xl font-light leading-tight">Settings</h1>
          <p className="text-base opacity-90 mt-1">Every value that changes how the station behaves, with its default. Admins only. Nothing changes until you press Save.</p>
        </div>
        <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-60" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search settings" aria-label="Search settings" />
        <button type="button" className="ops-btn px-4 min-h-11" aria-pressed={onlyChanged} onClick={() => setOnlyChanged(v => !v)}>
          Changed from default{values ? ` (${totalChanged})` : ''}
        </button>
      </div>

      {failed.length > 0 && (
        <div role="alert" className="ops-card p-3 flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[200px]">Could not load: {failed.join(', ')}. Those settings are not shown as changed.</span>
          <button type="button" className="ops-btn px-4 min-h-11" onClick={load}>Try again</button>
        </div>
      )}

      {!values && Array.from({ length: 3 }, (_, i) => <div key={i} className="ops-card min-h-[180px] p-4 motion-safe:animate-pulse" aria-hidden />)}
      {values && filtering && rows.length === 0 && (
        <p className="text-base ops-card p-4" role="status">{onlyChanged && !query.trim() ? 'Nothing has been changed from its default.' : 'No settings match.'}</p>
      )}

      {values && TIERS.map(tier => {
        const list = rows.filter(r => r.def.tier === tier)
        if (filtering && list.length === 0) return null
        const forced = filtering || focusTier === tier
        const isOpen = forced || open[tier]
        const info = TIER_INFO[tier]
        const changed = changedOnly(SETTINGS.filter(s => s.tier === tier).map(def => ({ def, value: values[def.id] }))).length
        const groups = [...new Set(list.map(r => r.def.group))]
        return (
          <section key={tier} aria-label={info.title} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <h2 className="text-3xl font-light">{info.title}</h2>
                <p className="text-base opacity-90">{info.text}{changed ? ` ${changed} changed.` : ''}</p>
              </div>
              {!forced && (
                <button type="button" className="ops-btn px-4 min-h-11" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [tier]: !o[tier] }))}>
                  {tier === 'defaults' ? (isOpen ? 'Hide advanced settings' : 'Show advanced settings') : isOpen ? 'Hide' : `Show ${list.length} settings`}
                </button>
              )}
            </div>
            {isOpen && groups.map(g => (
              <div key={g} className="space-y-3">
                <p className="text-base font-semibold">{g}</p>
                <div className="grid lg:grid-cols-2 gap-4">
                  {list.filter(r => r.def.group === g).map(r => (
                    <SettingRow key={r.def.id} def={r.def} value={r.value} highlight={focus === r.def.id} onSave={v => save(r.def.id, v)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}

      <p className="text-base opacity-90">Who changed a value and when is not recorded yet; the Server load page keeps its own change log. Daily limits and the other settings on their own pages (Auto DJ rules, Schedule, Page text, Blocked words) are edited there.</p>
    </div>
  )
}
