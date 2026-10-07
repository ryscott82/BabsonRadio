'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/auth'

// "Report bug / feature" button in the top bar, shown on every page to beta testers.
export default function TesterFeedback() {
  const { user, isTester } = useAuth()
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'bug' | 'feature'>('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  if (!user || !isTester) return null

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await api('/api/feedback', { type, message, platform: 'web', page: path })
      setMessage(''); setSent(true)
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not send.') }
    setBusy(false)
  }
  const close = () => { setOpen(false); setSent(false); setErr('') }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
              className="sk-key rounded-lg h-9 px-3 text-xs font-semibold text-br-dk-text whitespace-nowrap">
        <span className="hidden sm:inline">Report bug / feature</span><span className="sm:hidden">Report</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={close}>
          <form onSubmit={send} onClick={e => e.stopPropagation()} role="dialog" aria-label="Report a bug or suggest a feature"
                className="sk-raised rounded-2xl p-5 w-full max-w-md space-y-3">
            <h2 className="font-display text-br-dk-text tracking-widest text-sm">REPORT A BUG OR SUGGEST A FEATURE</h2>
            {sent ? (
              <>
                <p className="text-sm text-br-dk-text">Sent. Thank you, we read every one.</p>
                <button type="button" onClick={close} className="text-sm text-br-gold underline">Close</button>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  {(['bug', 'feature'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                            className={`rounded-full px-3 py-1 text-xs border ${type === t ? 'bg-br-gold text-black border-br-gold' : 'border-br-dk-border text-br-dk-sub'}`}>
                      {t === 'bug' ? 'Bug' : 'Feature idea'}
                    </button>
                  ))}
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={2000} required
                          placeholder={type === 'bug' ? 'What happened, and what did you expect?' : 'What should it do?'}
                          className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" />
                <p className="text-xs text-br-dk-sub">We include the page you are on ({path}).</p>
                {err && <p role="alert" className="text-sm text-br-red">{err}</p>}
                <div className="flex gap-3 items-center">
                  <button type="submit" disabled={busy} className="rounded-lg bg-br-gold text-black text-sm font-semibold px-4 py-2 disabled:opacity-50">
                    {busy ? 'Sending…' : 'Send report'}
                  </button>
                  <button type="button" onClick={close} className="text-sm text-br-dk-sub">Cancel</button>
                </div>
              </>
            )}
          </form>
        </div>,
        document.body,
      )}
    </>
  )
}
