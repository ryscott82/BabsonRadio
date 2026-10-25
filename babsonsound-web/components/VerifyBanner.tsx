'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { resendVerification } from '@/lib/auth'

// Shown while a new account is inside its 7-day window and the email link has not been clicked yet.
export default function VerifyBanner() {
  const { user, verifyDeadline, reload } = useAuth()
  const [msg, setMsg] = useState('')
  const path = usePathname()
  if (!user || !verifyDeadline || path.startsWith('/admin') || path === '/coming-soon') return null
  const when = new Date(verifyDeadline).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div role="status" className="relative z-[2] mt-16 -mb-16 bg-br-dk-bg border-b-2 border-br-gold px-4 py-3 text-center text-[15px] text-br-dk-text flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <span>Verify your email by {when} to keep your access.</span>
      <span className="inline-flex items-center gap-3">
        <button className="sk-key rounded-lg px-3 py-1.5 text-sm" onClick={async () => {
          try { await resendVerification(); setMsg('Sent again.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute.') }
        }}>Resend email</button>
        <button className="sk-key rounded-lg px-3 py-1.5 text-sm" onClick={() => reload()}>I verified</button>
      </span>
      {msg && <span className="basis-full text-br-dk-sub text-sm">{msg}</span>}
    </div>
  )
}
