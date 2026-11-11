'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { DISMISS_KEY, bannerFor, dismissValue, isDismissed, type BannerTone, type UsageStatus } from '@/lib/usageBanner'

const CACHE = 'usageStatusCache'
const FRESH = 5 * 60_000
const TONE: Record<BannerTone, { box: string; mark: string }> = {
  watch: { box: 'bg-black/40 border-white/50', mark: 'ⓘ' },
  warn: { box: 'bg-[#7a5800] border-[#ffd166]', mark: '▲' },
  alert: { box: 'bg-[#9a4300] border-[#ffb36b]', mark: '▲' },
  critical: { box: 'bg-[#b3261f] border-white', mark: '■' },
}

/**
 * Sits at the top of every admin page when the month's server time is at 50, 75, 90 or 100% of the allowance, or the forecast says it will pass.
 * It reads once when the admin opens (the answer is kept for 5 minutes, here and on the server) and never polls. The Server load page tells it
 * about fresher numbers through the "usage-status" event. Hiding it lasts until the next step up.
 */
export default function UsageBanner() {
  const { isAdmin, loading } = useAuth()
  const path = usePathname()
  const [s, setS] = useState<UsageStatus | null>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) ?? '' } catch { return '' } })

  const keep = useCallback((v: UsageStatus) => { setS(v); try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), v })) } catch { /* private window */ } }, [])
  useEffect(() => {
    if (loading || !isAdmin) return
    let alive = true
    queueMicrotask(async () => {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null') as { at: number; v: UsageStatus } | null
        if (c && Date.now() - c.at < FRESH) { if (alive) setS(c.v); return }
      } catch { /* no cache */ }
      try { const v = await apiGet<UsageStatus>('/api/admin/server-usage/status'); if (alive) keep(v) } catch { /* the banner is a convenience: say nothing if it cannot load */ }
    })
    const on = (e: Event) => keep((e as CustomEvent<UsageStatus>).detail)
    window.addEventListener('usage-status', on)
    return () => { alive = false; window.removeEventListener('usage-status', on) }
  }, [isAdmin, loading, keep])

  const b = isAdmin ? bannerFor(s) : null
  if (!b || !s || isDismissed(hidden, s.month, b.rank)) return null
  const t = TONE[b.tone]
  const hide = () => { const v = dismissValue(s.month, b.rank); setHidden(v); try { localStorage.setItem(DISMISS_KEY, v) } catch { /* private window */ } }
  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 pt-5">
      <div role={b.rank >= 4 ? 'alert' : 'status'} className={`border-2 ${t.box} text-white p-4 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <span aria-hidden className="text-xl">{t.mark}</span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-lg">{b.title}</p>
          <p className="text-base opacity-95">{b.text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {path !== '/admin/server-load' && <Link href="/admin/server-load" className="ops-btn inline-flex items-center px-4 py-2 no-underline">Open Server load</Link>}
          <button type="button" className="ops-btn px-4 py-2" onClick={hide}>Hide for now</button>
        </div>
      </div>
    </div>
  )
}
