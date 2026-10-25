'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'

/** "Submit feedback": a key that opens a small bug / idea form right where it sits. Sends to the same place as the profile page form. */
export default function FeedbackBox() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'bug' | 'feature'>('feature')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setNotice('')
    try {
      await api('/api/feedback', { type, message, platform: 'web', page: window.location.pathname })
      setMessage(''); setNotice('Sent. Thank you, we read every one.'); setOpen(false)
    } catch (error) { setErr(error instanceof Error ? error.message : 'Could not send.') }
    setBusy(false)
  }

  return (
    <div className="pt-4 border-t border-br-dk-border space-y-3">
      <button type="button" onClick={() => { setOpen(o => !o); setNotice('') }} aria-expanded={open}
              className="sk-key rounded-xl h-11 w-full text-sm">Submit feedback</button>
      {notice && <p role="status" className="text-sm hw-sub text-center">{notice}</p>}
      {open && (
        <form onSubmit={send} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['bug', 'feature'] as const).map(k => (
              <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className="sk-key rounded-lg py-2 text-sm">
                {k === 'bug' ? 'Something is wrong' : 'Idea'}
              </button>
            ))}
          </div>
          <textarea className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text focus:outline-none" rows={3} maxLength={2000}
                    value={message} onChange={e => setMessage(e.target.value)} required
                    placeholder={type === 'bug' ? 'What happened? What did you expect?' : 'What would make Babson Radio better?'} />
          {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
          <button type="submit" disabled={busy || message.trim().length < 3} className="sk-btn text-sm px-4 h-10 rounded-lg w-full">Send</button>
        </form>
      )}
    </div>
  )
}
