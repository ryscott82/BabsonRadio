'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Card, ErrorText, Field, PrimaryButton } from '@/components/AuthUI'

// Unlisted developer sign-in. Real Firebase credentials; only accounts with the
// `developer` claim (scripts/create-developer.mjs) get anything from it.
export default function DevSignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const { user } = await signInWithEmailAndPassword(auth, email.trim(), password)
      const claims = (await user.getIdTokenResult(true)).claims
      if (claims.developer !== true) {
        await fbSignOut(auth)
        throw new Error('That account is not a developer account.')
      }
      router.replace('/admin')
    } catch (err) {
      setError(err instanceof Error && err.message.includes('developer') ? err.message : 'Incorrect email or password.')
    }
    setBusy(false)
  }

  return (
    <Card title="Developer">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
        <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy}>Sign in</PrimaryButton>
      </form>
    </Card>
  )
}
