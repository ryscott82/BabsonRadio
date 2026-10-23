'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'
import { ErrorText, Field, GhostButton, PrimaryButton } from '@/components/AuthUI'

interface Preview { total: number; verified: number; unverified: number; optedOut: number; alreadySent: number }
interface SendResult { sent: number; failed: number; remaining: number; done: boolean; failures?: string[] }

const call = <T,>(action: 'preview' | 'test' | 'send') => api<T>('/api/admin/launch-email', { action })

export default function LaunchEmailPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; failed: number; remaining: number; done: boolean; failures: string[] } | null>(null)
  const stop = useRef(false)

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])

  const loadPreview = useCallback(async () => {
    setError('')
    try { setPreview(await call<Preview>('preview')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the counts.') }
  }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(loadPreview) }, [user, isAdmin, loadPreview])

  async function sendTest() {
    setBusy(true); setError(''); setNote('')
    try { await call<{ ok: boolean }>('test'); setNote(`Test sent to ${user?.email ?? 'you'}. Check your inbox and spam.`) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send the test.') }
    setBusy(false)
  }

  // Calls "send" over and over; each call mails one batch. Stopping, or an error, is safe: people already emailed are skipped next time.
  async function sendAll() {
    setRunning(true); setError(''); setNote(''); stop.current = false
    let sent = progress?.sent ?? 0, failed = progress?.failed ?? 0
    const failures = [...(progress?.failures ?? [])]
    try {
      for (;;) {
        const r = await call<SendResult>('send')
        sent += r.sent; failed += r.failed
        if (r.failures) failures.push(...r.failures)
        setProgress({ sent, failed, remaining: r.remaining, done: r.done, failures: [...failures] })
        if (r.done) break
        if (stop.current) { setNote('Paused. Press the button again to continue where it left off.'); break }
      }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Sending stopped.'} Nothing is sent twice, so it is safe to continue.`)
    }
    setRunning(false)
    loadPreview()
  }

  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  const ready = confirm === 'SEND' && !running
  const stat = (label: string, value: number | undefined) => (
    <div className="sk-field rounded-lg px-3 py-2">
      <p className="text-xs text-br-dk-sub">{label}</p>
      <p className="font-display text-br-dk-text text-2xl tabular-nums">{value ?? '–'}</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Launch email</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        This emails everyone who made an account before launch to say the radio is open. Check the counts, send yourself a test, then send to everyone.
        People who unsubscribed or already got this email are skipped, so it is safe to stop and continue. Sending happens in batches while this page is open, so keep the tab open until it says it is done.
      </p>

      <div className="sk-raised rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display tracking-widest text-xs text-br-gold">WHO WILL GET IT</p>
          <GhostButton type="button" onClick={loadPreview} disabled={running}>Refresh</GhostButton>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {stat('Accounts', preview?.total)}
          {stat('Verified email', preview?.verified)}
          {stat('Not verified', preview?.unverified)}
          {stat('Unsubscribed', preview?.optedOut)}
          {stat('Already sent', preview?.alreadySent)}
        </div>
      </div>

      <div className="sk-raised rounded-xl p-4 space-y-3">
        <p className="font-display tracking-widest text-xs text-br-gold">1. TEST</p>
        <p className="text-sm text-br-dk-sub">Sends one copy to {user.email ?? 'your address'} only.</p>
        <PrimaryButton type="button" busy={busy} disabled={running} onClick={sendTest}>Send test to me</PrimaryButton>
      </div>

      <div className="sk-raised rounded-xl p-4 space-y-3">
        <p className="font-display tracking-widest text-xs text-br-gold">2. SEND</p>
        <p className="text-sm text-br-dk-sub">This cannot be undone. Type SEND to unlock the button.</p>
        <Field label="Type SEND" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={running} />
        <PrimaryButton type="button" disabled={!ready} onClick={sendAll}>
          {running ? 'SENDING…' : progress && !progress.done ? 'Continue sending' : 'Send to everyone'}
        </PrimaryButton>
        {running && <GhostButton type="button" onClick={() => { stop.current = true }}>Pause after this batch</GhostButton>}

        {progress && (
          <div role="status" className="sk-field rounded-lg px-3 py-3 space-y-1 text-sm text-br-dk-text">
            <p><span className="tabular-nums">{progress.sent}</span> sent · <span className="tabular-nums">{progress.failed}</span> failed · <span className="tabular-nums">{progress.remaining}</span> remaining</p>
            {progress.done && <p className="text-br-gold">Done.</p>}
          </div>
        )}
        {note && <p role="status" className="text-sm text-br-gold">{note}</p>}
        <ErrorText>{error}</ErrorText>
      </div>

      {progress?.done && progress.failed > 0 && (
        <div className="sk-raised rounded-xl p-4 space-y-2">
          <p className="font-display tracking-widest text-xs text-br-red">{progress.failed} FAILED</p>
          {progress.failures.length > 0
            ? <ul className="text-sm text-br-dk-sub space-y-1">{progress.failures.map((f, i) => <li key={i} className="break-all">{f}</li>)}</ul>
            : <p className="text-sm text-br-dk-sub">The server did not list the addresses. Press Refresh above and compare with the counts, or check the server log.</p>}
        </div>
      )}
    </div>
  )
}
