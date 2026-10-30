'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { resendVerification } from '@/lib/auth'
import { amberFrom, firstMissing, openSetup } from '@/lib/setup-ui'

// A slim bar under the top menu on every signed-in page while setup is unfinished. It floats over the page (nothing moves when it
// appears). Tap it to open the next missing step. In the last 2 days of the 7-day email window it turns amber and offers a resend.
const HIDDEN = ['/auth', '/admin', '/coming-soon', '/booth']

export default function SetupBanner() {
  const { user, setup } = useAuth()
  const pathname = usePathname()
  const [msg, setMsg] = useState('')
  const [now] = useState(() => Date.now()) // read once: the banner is re-evaluated whenever setup or the page changes
  const missing = firstMissing(setup)
  if (!user || !setup || !missing || HIDDEN.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null

  const from = amberFrom(setup.emailDeadlineAt)
  const amber = from !== null && now >= from
  const days = setup.emailDeadlineAt ? Math.max(0, Math.ceil((setup.emailDeadlineAt - now) / 86_400_000)) : 0
  const tone = amber ? 'bg-[#F2B33D] text-[#1a1710]' : 'bg-br-dk-surface text-br-dk-text border-b border-br-dk-border'

  return (
    <div role="status" className={`fixed top-16 inset-x-0 z-40 ${tone}`}>
      <div className="max-w-6xl lg:max-w-[1800px] mx-auto px-4 lg:px-8 xl:px-12 min-h-9 py-1 flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={() => openSetup(missing)} className="flex-1 min-w-0 text-left py-1 truncate">
          <span className="font-medium">{amber ? `Verify your email${days ? ` in ${days} day${days === 1 ? '' : 's'}` : ' now'}` : 'Complete Sign Up'}</span>
          <span className={amber ? 'opacity-80' : 'text-br-dk-sub'}> · {setup.doneCount} of {setup.total} done</span>
        </button>
        {amber && (
          <button type="button" className="shrink-0 rounded-lg border border-current px-3 py-1 text-sm"
                  onClick={async () => { try { await resendVerification(); setMsg('Sent') } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute') } }}>
            {msg || 'Resend email'}
          </button>
        )}
      </div>
    </div>
  )
}
