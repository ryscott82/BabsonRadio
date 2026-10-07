'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface Row { id: string; name: string; username: string; email: string; role: string; accountType: string }

const ROLE_LABEL: Record<string, string> = { listener: 'Listener', showHost: 'Show host', superAdmin: 'Admin', developer: 'Developer' }
const PRIVILEGED = ['superAdmin', 'developer']

export default function AdminUsersPage() {
  const { user, isAdmin, isDeveloper, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { setRows((await apiGet<{ users: Row[] }>('/api/admin/users')).users) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load users.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) queueMicrotask(load) }, [user, isAdmin, load])

  async function setRole(r: Row, role: string) {
    setError(''); setNote('')
    try {
      const res = await api<{ note?: string }>('/api/admin/users', { uid: r.id, role })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, role } : x)))
      setNote(`${r.name || r.email} is now ${ROLE_LABEL[role]?.toLowerCase()}.${res.note ? ` ${res.note}` : ''}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (!user || !isAdmin) return null
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => !needle || `${r.name} ${r.email} ${r.username}`.toLowerCase().includes(needle))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">USERS</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <span className="text-xs text-br-dk-sub shrink-0">{rows.length} accounts</span>
      </div>
      <p className="text-sm text-br-dk-sub">
        Listener: normal student access. Show host: manages shows and uploads. Admin: runs the station and manages listeners and hosts. Developer: everything, and the only role that can make or remove admins and developers. Only students with a school email can hold these roles.
      </p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or username"
             className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text" />
      <ErrorText>{error}</ErrorText>
      {note && <p role="status" className="text-sm text-br-gold">{note}</p>}
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-br-dk-sub">No accounts found.</p>}
        {shown.map(r => {
          const student = r.accountType !== 'guest' && r.role !== 'guest'
          // Admins can't touch admin or developer accounts (or promote anyone to them); developers can.
          const locked = !isDeveloper && PRIVILEGED.includes(r.role)
          const options = Object.entries(ROLE_LABEL).filter(([v]) => isDeveloper || !PRIVILEGED.includes(v))
          return (
            <div key={r.id} className="sk-raised rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-br-dk-text truncate">{r.name || '(no name)'}{r.username ? ` · @${r.username}` : ''}</p>
                <p className="text-xs text-br-dk-sub truncate">{r.email}{r.accountType === 'guest' ? ' · guest' : ''}</p>
              </div>
              {student && r.id !== user.uid && !locked ? (
                <select value={r.role} onChange={e => setRole(r, e.target.value)} aria-label={`Role for ${r.name || r.email}`}
                        className="sk-field rounded-lg px-2 py-1.5 text-sm text-br-dk-text shrink-0">
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <span className="text-xs text-br-dk-sub shrink-0">{r.id === user.uid ? `You · ${ROLE_LABEL[r.role] ?? ''}` : locked ? ROLE_LABEL[r.role] : 'Guest'}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
