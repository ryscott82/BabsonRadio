'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, apiGet } from '@/lib/auth'
import { roleLabel } from '@/lib/roleLabel'

interface Person { id: string; name: string; email: string; level: string }
interface Invite { email: string; level: string }
const ROLES = [{ id: 'arts', label: 'BabsonARTS' }, { id: 'director', label: 'E-board' }, { id: 'admin', label: 'Admin' }] as const

/** Who is staff, and adding BabsonARTS staff, E-board members and Admins by email. Nobody's role goes down from here. */
export default function StaffCard() {
  const [staff, setStaff] = useState<Person[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [level, setLevel] = useState<(typeof ROLES)[number]['id']>('arts')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { apiGet<{ staff: Person[]; invites: Invite[] }>('/api/arts/staff').then(r => { setStaff(r.staff); setInvites(r.invites) }).catch(e => { setErr(e instanceof Error ? e.message : 'Could not load.'); setStaff([]) }) }, [])
  useEffect(() => { queueMicrotask(load) }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    if (!email.trim()) { setErr('Enter an email address.'); return }
    setBusy(true)
    try {
      const r = await api<{ invited?: boolean }>('/api/arts/staff', { email: email.trim(), level })
      setMsg(r.invited ? 'Saved. The role starts when they sign up and verify their email.' : 'Added.')
      setEmail(''); load()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Could not add them.') }
    setBusy(false)
  }

  return (
    <section className="ops-card p-5 space-y-3" aria-label="Staff">
      <h2 className="text-2xl font-light">Staff</h2>
      <form onSubmit={add} className="space-y-3">
        <label className="block text-base">Email
          <input type="email" className="ops-field w-full min-h-11 mt-1" value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" spellCheck={false} placeholder="name@babson.edu" />
        </label>
        <label className="block text-base">Role
          <select className="ops-field w-full min-h-11 mt-1" value={level} onChange={e => setLevel(e.target.value as typeof level)}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        {err && <p role="alert" className="text-base font-semibold bg-white text-[#9d1c14] px-3 py-1">{err}</p>}
        {msg && <p role="status" className="text-base">{msg}</p>}
        <button type="submit" disabled={busy} className="ops-btn px-5 min-h-11 disabled:opacity-50">{busy ? 'Adding…' : 'Add'}</button>
      </form>
      {!staff && <p className="text-base">Loading…</p>}
      {staff && (
        <ul className="divide-y divide-white/25 max-h-80 overflow-y-auto">
          {staff.map(p => <li key={p.id} className="py-2 text-base">{p.name || '(no name)'} <span className="opacity-90">· {p.email} · {roleLabel(p.level)}</span></li>)}
          {invites.map(i => <li key={i.email} className="py-2 text-base">{i.email} <span className="opacity-90">· {roleLabel(i.level)} · waiting for them to sign up</span></li>)}
        </ul>
      )}
    </section>
  )
}
