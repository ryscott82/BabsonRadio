'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { signOut, resendVerification } from '@/lib/auth'
import SignInForm from '@/components/SignInForm'
import { Card, GhostButton, PrimaryButton } from '@/components/AuthUI'
import { safeNext } from '@/lib/signInPrompt'

export default function AuthPage() {
  const { user, loading, needsVerification, reload } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Back to the page that sent them here (?next=, same site only), otherwise home.
    if (!loading && user && !needsVerification) {
      let next: string | null = null
      try { next = new URLSearchParams(window.location.search).get('next') } catch { /* no address */ }
      router.replace(safeNext(next))
    }
  }, [loading, user, needsVerification, router])

  if (loading) return <Spinner />
  if (user && needsVerification) return <VerifyPanel email={user.email!} onCheck={reload} />
  if (user) return <Spinner />
  return <Forms />
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Forms() {
  return (
    <Card title="Babson Radio" subtitle="Student radio — Babson College">
      <SignInForm />
    </Card>
  )
}

function VerifyPanel({ email, onCheck }: { email: string; onCheck: () => Promise<void> }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // Re-check when the user comes back from their inbox.
  useEffect(() => {
    const f = () => { onCheck().catch(() => {}) }
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [onCheck])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg('')
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : 'Try again in a minute.') }
    setBusy(false)
  }

  return (
    <Card title="Verify your email" subtitle={`We sent a link to ${email}. Open it, then come back here.`}>
      <div className="space-y-3">
        <PrimaryButton busy={busy} onClick={() => run(onCheck, 'Click the link in your email first.')}>
          I&apos;VE VERIFIED
        </PrimaryButton>
        <div className="flex justify-between">
          <GhostButton onClick={() => run(resendVerification, 'Sent again. Check your inbox and spam.')}>Resend email</GhostButton>
          <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
        </div>
        {msg && <p className="text-center text-sm text-br-dk-sub">{msg}</p>}
        <p className="text-center text-sm text-br-dk-sub">Check your spam folder.</p>
      </div>
    </Card>
  )
}
