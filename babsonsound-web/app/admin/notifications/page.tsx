'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import Notifications, { type Notice } from '@/components/admin/Notifications'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { BROADCAST_BODY_MAX, BROADCAST_TITLE_MAX } from '@/lib/broadcastGuard'
import { ALERTS_URL, ALL_CLEAR, BROADCAST_URL, canSend, confirmBody, counter, goesTo } from '@/lib/notificationsPage'
import { startPolling } from '@/lib/todayPage'

interface Sent { id: string; title: string; body: string; at: number; sent: number; by: string }

// Notifications: what needs attention (the inbox), and a message to every phone that turned on station announcements. E-board and Admin.
// The inbox reads GET /api/admin/alerts when the page opens and again every 60 seconds while the tab is visible, never faster.
// The sending side reads GET /api/admin/broadcast once (phone count and history) and again after each send.
export default function NotificationsPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<Notice[] | null>(null)
  const [dismissed, setDismissed] = useState(0)
  const [phones, setPhones] = useState<number | null>(null)
  const [history, setHistory] = useState<Sent[] | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  const loadAlerts = useCallback(() => { apiGet<{ items: Notice[]; dismissedCount: number }>(ALERTS_URL).then(r => { setItems(r.items); setDismissed(r.dismissedCount) }).catch(() => {}) }, [])
  useEffect(() => {
    if (!user || !isDirector) return
    return startPolling(loadAlerts, { hidden: () => document.hidden, every: (fn, ms) => { const t = setInterval(fn, ms); return () => clearInterval(t) } })
  }, [user, isDirector, loadAlerts])
  const loadSent = useCallback(() => {
    apiGet<{ phones: number; history: Sent[] }>(BROADCAST_URL).then(r => { setPhones(r.phones); setHistory(r.history) }).catch(e => setError(e instanceof Error ? e.message : 'Could not load the sent messages.'))
  }, [])
  useEffect(() => { if (user && isDirector) queueMicrotask(loadSent) }, [user, isDirector, loadSent])

  async function send() {
    setBusy(true); setError(''); setMsg('')
    try {
      const r = await api<{ sent: number }>(BROADCAST_URL, { title: title.trim(), body: body.trim() })
      setMsg(`Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}.`); setTitle(''); setBody(''); loadSent()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send.') } // the server's own sentence, e.g. the 10 minute limit
    setBusy(false); setAsking(false)
  }

  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />
  const draft = { title, body }
  const ok = canSend(draft, phones ?? 0)
  const field = 'ops-field w-full min-h-11'

  return (
    <div className="px-5 lg:px-8 py-6 space-y-6">
      <h1 className="text-4xl font-light leading-tight">Notifications</h1>
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div className="min-w-0">
          {items === null
            ? <section className="ops-card p-5 min-h-[8rem]" aria-busy="true"><h2 className="text-2xl font-light">Inbox</h2></section>
            : <Notifications items={items} dismissedCount={dismissed} reload={loadAlerts} title="Inbox" emptyText={ALL_CLEAR} />}
        </div>

        <div className="min-w-0 space-y-6">
          <section className="ops-card p-5 space-y-4" aria-label="Send a notification">
            <h2 className="text-2xl font-light">Send to phones</h2>
            <p className="text-base">{phones === null ? 'Counting phones…' : goesTo(phones)}</p>
            <form onSubmit={e => { e.preventDefault(); if (ok) setAsking(true) }} className="space-y-3">
              <label className="block text-base">Title
                <input className={`${field} mt-1`} value={title} maxLength={BROADCAST_TITLE_MAX} onChange={e => setTitle(e.target.value)} placeholder="Live from the quad" />
                <span className="text-base opacity-80">{counter(title, BROADCAST_TITLE_MAX)}</span>
              </label>
              <label className="block text-base">Message
                <input className={`${field} mt-1`} value={body} maxLength={BROADCAST_BODY_MAX} onChange={e => setBody(e.target.value)} placeholder="Tune in at 6 for a live set" />
                <span className="text-base opacity-80">{counter(body, BROADCAST_BODY_MAX)}</span>
              </label>
              <div aria-label="Preview" className="rounded-xl border border-white/40 bg-black/20 p-3">
                <p className="text-base opacity-80">Preview</p>
                <p className="text-base font-semibold break-words">{title || 'Title'}</p>
                <p className="text-base break-words">{body || 'Message'}</p>
              </div>
              {error && <p role="alert" className="text-base font-semibold">{error}</p>}
              {msg && <p role="status" className="text-base">{msg}</p>}
              <button type="submit" disabled={!ok} className="ops-btn px-5 min-h-11 disabled:opacity-50">Send to phones</button>
              {phones === 0 && <p className="text-base opacity-90">No phones have station announcements turned on yet.</p>}
            </form>
          </section>

          <section className="ops-card p-5" aria-label="Sent messages">
            <h2 className="text-2xl font-light mb-2">Sent</h2>
            {history === null ? <p className="text-base">Loading…</p> : history.length === 0 ? <p className="text-base">Nothing sent yet.</p> : (
              <ul className="divide-y divide-white/25">
                {history.map(h => (
                  <li key={h.id} className="py-2 text-base">
                    <p className="font-semibold break-words">{h.title}</p>
                    <p className="break-words">{h.body}</p>
                    <p className="text-base opacity-80">{new Date(h.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {h.sent} phone{h.sent === 1 ? '' : 's'}{h.by ? ` · ${h.by}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {asking && (
        <ConfirmDialog title={`Send this to ${phones ?? 0} phone${phones === 1 ? '' : 's'}?`} action="Send" busy={busy} onNo={() => setAsking(false)} onYes={send}>
          <p className="text-base whitespace-pre-line">{confirmBody(draft, phones ?? 0)}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
