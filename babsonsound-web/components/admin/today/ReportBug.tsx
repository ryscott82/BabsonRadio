'use client'

import { useState } from 'react'
import { api } from '@/lib/auth'

/** Report a bug from any admin page: one box, one button. It files a bug report (the same route the app and website use); staff read them under Advanced, Bugs and ideas. */
export default function ReportBug() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    try { await api('/api/feedback', { type: 'bug', message: text.trim(), platform: 'web', page: '/admin' }); setText(''); setMsg('Thanks. Your report was sent.') }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not send that. Try again.') } // the server's own sentence, e.g. the hourly limit
    setBusy(false)
  }
  return (
    <section className="ops-card p-5 space-y-3 h-full" aria-label="Report a bug">
      <h2 className="text-2xl font-light">Report a bug</h2>
      <form onSubmit={send} className="space-y-3">
        <textarea className="ops-field w-full min-h-28" value={text} maxLength={2000} onChange={e => { setText(e.target.value); setMsg('') }} aria-label="What went wrong?" placeholder="What went wrong? What page were you on?" />
        {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-2">{err}</p>}
        {msg && <p role="status" className="text-base font-semibold">{msg}</p>}
        <button type="submit" className="ops-btn px-5 min-h-11 disabled:opacity-50" disabled={busy || text.trim().length < 5}>{busy ? 'Sending…' : 'Send report'}</button>
      </form>
    </section>
  )
}
