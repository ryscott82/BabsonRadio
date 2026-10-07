'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { inMemoryPersistence, setPersistence, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { rememberUnlock } from '@/lib/prelaunch-client'
import { LINKS } from '@/lib/links'
import { ErrorText, Field, PrimaryButton } from '@/components/AuthUI'
import ShareFormButton from '@/components/ShareFormButton'

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, mins: Math.floor(s / 60) % 60, secs: s % 60 }
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="sk-raised rounded-xl w-[4.5rem] sm:w-28 py-4 sm:py-6 text-center">
        <span className="font-display text-5xl sm:text-7xl text-br-dk-text tabular-nums leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="font-display tracking-[0.25em] text-xs text-br-dk-sub">{label}</span>
    </div>
  )
}

export default function ComingSoon({ launchISO }: { launchISO: string }) {
  const router = useRouter()
  const launch = new Date(launchISO).getTime()
  const [now, setNow] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('') // decoy: must stay empty
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()))
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const t = parts(launch - (now ?? launch))
  const arrived = now !== null && now >= launch

  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const res = await fetch('/api/prelaunch/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw, email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(`${d.error ?? 'Could not unlock.'} (${d.code ?? `BR-SRV-000, status ${res.status}`})`)
      } else {
        const d = await res.json()
        // Session cookie (no expiry) that PreviewLock removes on refresh; sign-in kept in memory only.
        rememberUnlock(d.gate, d.customToken ?? null)
        if (d.customToken) {
          await setPersistence(auth, inMemoryPersistence)
          await signInWithCustomToken(auth, d.customToken)
        }
        router.replace('/')
        router.refresh()
      }
    } catch {
      setError("Can't reach Babson Radio. Check your connection. (BR-CLI-001)")
    }
    setBusy(false)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display tracking-[0.4em] text-br-gold text-sm sm:text-base mb-3">BABSON RADIO</p>
      <h1 className="font-display text-br-dk-text text-6xl sm:text-8xl md:text-9xl leading-[0.9] tracking-wide mb-4">
        RADIO IS BACK
      </h1>
      <p className="text-br-dk-sub text-base sm:text-lg mb-10 max-w-md">
        {arrived ? "We're getting on the air. Check back in a moment." : 'Student radio returns October 22.'}
      </p>

      <a href={LINKS.interest} target="_blank" rel="noopener noreferrer"
         className="sk-btn block w-full max-w-3xl font-display tracking-[0.12em] text-3xl sm:text-5xl md:text-6xl leading-none px-6 py-7 sm:py-9 rounded-2xl mb-3">
        FILL OUT THE INTEREST FORM
      </a>
      <p className="text-br-dk-sub text-base sm:text-lg mb-5">Takes under a minute. Tell us what you want to hear.</p>
      <ShareFormButton className="mb-14" />

      <div className="flex items-start gap-3 sm:gap-6 mb-14" role="timer" aria-label="Time until October 22">
        <Tile value={t.days} label="DAYS" />
        <Tile value={t.hours} label="HOURS" />
        <Tile value={t.mins} label="MINUTES" />
        <Tile value={t.secs} label="SECONDS" />
      </div>

      <p className="text-sm text-br-dk-sub mb-3">
        Beta tester? <Link href="/auth" className="underline underline-offset-4 text-br-dk-text">Sign in or create your account</Link>
      </p>
      <p className="text-xs text-br-dk-sub mb-3"><Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link> · <Link href="/terms" className="underline underline-offset-4">Terms</Link></p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-br-dk-sub hover:text-br-dk-text underline underline-offset-4">
          Developer access
        </button>
      ) : (
        <form onSubmit={unlock} className="w-full max-w-xs space-y-4 text-left sk-raised rounded-2xl p-5">
          <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                 autoComplete="off" placeholder="you@example.com" />
          <Field label="Developer password" type="password" value={pw} onChange={e => setPw(e.target.value)}
                 autoComplete="current-password" autoFocus />
          <ErrorText>{error}</ErrorText>
          <PrimaryButton type="submit" busy={busy}>UNLOCK</PrimaryButton>
        </form>
      )}
    </div>
  )
}
