'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { resendVerification } from '@/lib/auth'

// Shown while a new account is inside its 7-day window and the email link has not been clicked yet.
export default function VerifyBanner() {
  const { user, verifyDeadline, reload } = useAuth()
  const [msg, setMsg] = useState('')
  if (!user || !verifyDeadline) return null
  const when = new Date(verifyDeadline).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div role="status" className="fixed top-16 inset-x-0 z-30 bg-br-gold/15 border-b border-br-gold/40 px-4 py-2 text-center text-xs text-br-dk-text">
      Verify your email by {when} to keep your access. Check your inbox and spam for the link.{' '}
      <button className="underline text-br-gold" onClick={async () => {
        try { await resendVerification(); setMsg('Sent again.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute.') }
      }}>Resend</button>
      {' · '}
      <button className="underline text-br-gold" onClick={() => reload()}>I verified</button>
      {msg && <span className="ml-2 text-br-dk-sub">{msg}</span>}
    </div>
  )
}
