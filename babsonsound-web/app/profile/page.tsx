'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, deleteMyAccount, signOut } from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

export default function ProfilePage() {
  const { user, userDoc, loading, isBabson, isDeveloper, isGuest } = useAuth()
  const router = useRouter()
  const [invisible, setInvisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/auth')
    else if (isGuest) router.replace('/auth/guest')
  }, [loading, user, isGuest, router])

  useEffect(() => {
    if (!user || isGuest) return
    apiGet<{ invisible: boolean }>('/api/me').then(r => setInvisible(r.invisible)).catch(() => {})
  }, [user, isGuest])

  if (loading || !user || isGuest) return null

  async function toggle() {
    setSaving(true); setError('')
    const next = !invisible
    setInvisible(next)
    try { await api('/api/me', { invisible: next }) }
    catch (e) { setInvisible(!next); setError(e instanceof Error ? e.message : 'Could not save.') }
    setSaving(false)
  }

  return (
    <Card title="YOUR PROFILE">
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-br-dk-text text-lg">{userDoc?.firstName ?? userDoc?.displayName ?? user.displayName}</p>
          <p className="text-br-dk-sub text-sm">{user.email}{isDeveloper ? ' · Developer' : ''}</p>
        </div>

        {(isBabson || isDeveloper) && (
          <div className="bg-br-dk-surface border border-br-dk-border rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-br-dk-text text-sm font-medium">Invisible mode</p>
                <p className="text-br-dk-sub text-xs mt-1">
                  Friends won&apos;t see you tuned in, and your likes won&apos;t show up as &ldquo;your friend liked this.&rdquo;
                </p>
              </div>
              <button role="switch" aria-checked={invisible} disabled={saving} onClick={toggle}
                      className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${invisible ? 'bg-br-gold' : 'bg-br-dk-border'}`}>
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${invisible ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>

        {isBabson && <p className="text-center text-sm"><Link href="/guest-access" className="text-br-gold">Guest access</Link></p>}

        <div className="text-center space-y-4">
          <GhostButton onClick={() => signOut()}>SIGN OUT</GhostButton>
          {!showDelete ? (
            <button className="block mx-auto text-xs text-br-dk-sub hover:text-br-red" onClick={() => setShowDelete(true)}>Delete my account</button>
          ) : (
            <form className="space-y-3 text-left" onSubmit={async e => {
              e.preventDefault(); setBusy(true); setError('')
              try { await deleteMyAccount(pw) } catch (err) { setError(err instanceof Error ? err.message : 'Failed.') }
              setBusy(false)
            }}>
              <Field label="Enter your password to permanently delete your account" type="password" value={pw}
                     onChange={e => setPw(e.target.value)} autoComplete="current-password" />
              <PrimaryButton type="submit" busy={busy}>DELETE FOREVER</PrimaryButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}
