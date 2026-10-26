'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { completeEmailLink, isEmailLink } from '@/lib/auth'
import { Card, ErrorText, PrimaryButton } from '@/components/AuthUI'

// Where the emailed sign-in link lands. Signs the person in, makes their profile on the first visit, then goes home.
export default function EmailLinkPage() {
  const router = useRouter()
  const { reload } = useAuth()
  const started = useRef(false) // a link works once, so never run it twice (React dev mode runs effects twice)
  const [error, setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!isEmailLink()) { queueMicrotask(() => setError('That sign-in link did not work. Ask for a new one.')); return }
    completeEmailLink()
      .then(() => reload()) // pick up the profile that was just created
      .then(() => router.replace('/'))
      .catch(e => setError(e instanceof Error ? e.message : 'That link did not work. Ask for a new one.'))
  }, [router, reload])

  if (!error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-6 h-6 border-2 border-br-gold border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-br-dk-sub">Signing you in…</p>
      </div>
    )
  }
  return (
    <Card title="Sign-in link" subtitle="We couldn't use that link.">
      <div className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <Link href="/auth"><PrimaryButton type="button">Get a new link</PrimaryButton></Link>
      </div>
    </Card>
  )
}
