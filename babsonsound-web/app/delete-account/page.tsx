'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { deleteMyAccount } from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

export default function DeleteAccountPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!loading && !user) router.replace('/auth') }, [loading, user, router])
  if (loading || !user) return null

  async function remove(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await deleteMyAccount(password); router.replace('/') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the account.'); setBusy(false) }
  }

  return (
    <Card title="Delete account" subtitle="This permanently deletes your account and cannot be undone.">
      <form onSubmit={remove} className="space-y-4">
        <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" busy={busy} disabled={!password}>Delete account</PrimaryButton>
        <GhostButton type="button" onClick={() => router.back()} className="block mx-auto">Cancel</GhostButton>
      </form>
    </Card>
  )
}
