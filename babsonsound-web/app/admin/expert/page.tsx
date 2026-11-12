'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import SettingRow from '@/components/admin/SettingRow'
import SettingsHistory from '@/components/admin/SettingsHistory'
import { apiGet, apiPatch } from '@/lib/auth'
import { changedOnly, patchBody, settingMatches, type SettingTier, type SettingValue } from '@/lib/settingRow'
import { TIER_INFO, toRow, type ServerSetting } from '@/lib/settingsDefs'

const TIERS: SettingTier[] = ['everyday', 'customize', 'defaults']
interface Reply { settings: ServerSetting[] }

// Admin only. Every setting in one place, in three stacked sections: Everyday (open), Customize (collapsed), and Defaults and safety (behind
// "Show advanced settings"). Each row shows the value now, the default, who changed it and when, a Changed badge, Reset to default, and a
// confirm step for values that can hurt every listener. One read when the page opens (GET /api/admin/settings, no polling); each save is one
// PATCH that returns the whole list again. The History panel at the bottom loads only when it is opened.
export default function ExpertSettingsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [list, setList] = useState<ServerSetting[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [open, setOpen] = useState<Record<SettingTier, boolean>>({ everyday: true, customize: false, defaults: false })
  const [focus] = useState(() => { try { return new URLSearchParams(window.location.search).get('focus') ?? '' } catch { return '' } }) // from a search result in the admin menu
  const [version, setVersion] = useState(0) // bumps after each save so an open History panel reloads

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try { setList((await apiGet<Reply>('/api/admin/settings')).settings) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the settings.') }
    setBusy(false)
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  const all = useMemo(() => (list ?? []).map(toRow), [list])
  const focusTier = all.find(r => r.def.id === focus)?.def.tier
  const filtering = query.trim() !== '' || onlyChanged
  const rows = useMemo(() => {
    const m = all.filter(r => settingMatches(r.def, query))
    return onlyChanged ? changedOnly(m) : m
  }, [all, query, onlyChanged])
  const totalChanged = useMemo(() => changedOnly(all).length, [all])

  const save = useCallback(async (id: string, next: SettingValue | null) => {
    const r = await apiPatch<Reply>('/api/admin/settings', patchBody(id, next))
    setList(r.settings); setVersion(v => v + 1)
  }, [])

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const field = 'ops-field w-full sm:w-80 min-h-11'

  return (
    <div className="max-w-[1100px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-4xl font-light leading-tight">Expert settings</h1>
          <p className="text-base opacity-90 mt-1">Every setting with its recommended value. You almost never need this page: the settings that matter are on the page they control (Show requests, Auto DJ, Listening, Server load). Admins only. Nothing changes until you press Save.</p>
        </div>
        <button type="button" className="ops-btn px-4 min-h-11 disabled:opacity-60" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search settings" aria-label="Search settings" />
        <button type="button" className="ops-btn px-4 min-h-11" aria-pressed={onlyChanged} onClick={() => setOnlyChanged(v => !v)}>
          Changed from recommended{list ? ` (${totalChanged})` : ''}
        </button>
      </div>

      {error && (
        <div role="alert" className="ops-card p-3 flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[200px]">{error}</span>
          <button type="button" className="ops-btn px-4 min-h-11" onClick={load}>Try again</button>
        </div>
      )}

      {!list && !error && Array.from({ length: 3 }, (_, i) => <div key={i} className="ops-card min-h-[180px] p-4 motion-safe:animate-pulse" aria-hidden />)}
      {list && filtering && rows.length === 0 && (
        <p className="text-base ops-card p-4" role="status">{onlyChanged && !query.trim() ? 'Nothing has been changed from the recommended value.' : 'No settings match.'}</p>
      )}

      {list && TIERS.map(tier => {
        const inTier = rows.filter(r => r.def.tier === tier)
        if (filtering && inTier.length === 0) return null
        const forced = filtering || focusTier === tier
        const isOpen = forced || open[tier]
        const info = TIER_INFO[tier]
        const changed = changedOnly(all.filter(r => r.def.tier === tier)).length
        const groups = [...new Set(inTier.map(r => r.def.group))]
        return (
          <section key={tier} aria-label={info.title} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <h2 className="text-3xl font-light">{info.title}</h2>
                <p className="text-base opacity-90">{info.text}{changed ? ` ${changed} changed.` : ''}</p>
              </div>
              {!forced && (
                <button type="button" className="ops-btn px-4 min-h-11" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [tier]: !o[tier] }))}>
                  {tier === 'defaults' ? (isOpen ? 'Hide advanced settings' : 'Show advanced settings') : isOpen ? 'Hide' : `Show ${inTier.length} settings`}
                </button>
              )}
            </div>
            {isOpen && groups.map(g => (
              <div key={g} className="space-y-3">
                <p className="text-base font-semibold">{g}</p>
                <div className="grid lg:grid-cols-2 gap-4">
                  {inTier.filter(r => r.def.group === g).map(r => (
                    <SettingRow key={r.def.id} def={r.def} value={r.value} highlight={focus === r.def.id}
                                meta={{ changedAt: r.changedAt, changedBy: r.changedBy }} onSave={v => save(r.def.id, v)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      })}

      {list && <SettingsHistory reloadKey={version} labelOf={k => all.find(r => r.def.id === k)?.def.label} />}

      <p className="text-base opacity-90">Auto DJ rules and playlists, Schedule, Page text and Blocked words are edited on their own pages. Settings that do nothing today say &ldquo;Not enforced right now&rdquo;. Saves made on the older pages (Listening limits, Server load) are not in the History.</p>
    </div>
  )
}
