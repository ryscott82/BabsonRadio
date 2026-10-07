'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet, deleteMyAccount, signOut } from '@/lib/auth'
import { Card, ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

function ReportForm() {
  const [type, setType] = useState<'bug' | 'feature'>('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setNotice('')
    try {
      await api('/api/feedback', { type, message, platform: 'web', page: window.location.pathname })
      setMessage(''); setNotice('Sent. Thank you, we read every one.')
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not send.') }
    setBusy(false)
  }

  return (
    <form onSubmit={send} className="sk-raised rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-br-dk-text tracking-widest text-sm">REPORT A BUG OR SUGGEST A FEATURE</h2>
      <div className="grid grid-cols-2 gap-2">
        {(['bug', 'feature'] as const).map(k => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
                  className="sk-key rounded-lg py-2 text-xs font-display tracking-widest text-br-dk-text">
            {k === 'bug' ? 'SOMETHING IS WRONG' : 'IDEA'}
          </button>
        ))}
      </div>
      <textarea className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" rows={4} maxLength={2000}
                value={message} onChange={e => setMessage(e.target.value)} required
                placeholder={type === 'bug' ? 'What happened? What did you expect?' : 'What would make Babson Radio better?'} />
      <ErrorText>{err}</ErrorText>
      {notice && <p className="text-sm text-br-gold">{notice}</p>}
      <PrimaryButton type="submit" busy={busy}>SEND</PrimaryButton>
    </form>
  )
}

export default function ProfilePage() {
  const { user, userDoc, loading, isBabson, isDeveloper, isGuest } = useAuth()
  const router = useRouter()
  const [invisible, setInvisible] = useState(false)
  const [hosts, setHosts] = useState(false) // listed as a show host (or staff)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !(isBabson || isDeveloper)) return
    apiGet<{ staff: boolean; shows: unknown[] }>('/api/host/status').then(r => setHosts(r.staff || r.shows.length > 0)).catch(() => {})
  }, [user, isBabson, isDeveloper])

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
          <p className="text-br-dk-text text-lg">{[userDoc?.firstName ?? userDoc?.displayName ?? user.displayName, userDoc?.lastName].filter(Boolean).join(' ')}</p>
          {userDoc?.username && <p className="text-br-gold text-sm font-display tracking-widest">@{userDoc.username}</p>}
          <p className="text-br-dk-sub text-sm">{user.email}{isDeveloper ? ' · Developer' : ''}</p>
        </div>

        {hosts && (
          <Link href="/host" className="block sk-raised rounded-2xl p-5">
            <p className="text-br-dk-text text-sm font-medium">Host panel</p>
            <p className="text-br-dk-sub text-xs mt-1">Radio controls and your set list (open around your show), plus changes to your show page.</p>
          </Link>
        )}

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
                      className="sk-switch shrink-0">
                <span className="sk-knob" />
              </button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>

        <ReportForm />

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
