'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

type Level = 'guest' | 'student' | 'director' | 'admin'
interface Row { id: string; name: string; username: string; email: string; level: Level; studioTrained: boolean; radioTrained: boolean; owner: boolean; you: boolean }

const LEVEL_LABEL: Record<Level, string> = { guest: 'Guest', student: 'Student', director: 'Director', admin: 'Admin' }
const LEVELS = Object.keys(LEVEL_LABEL) as Level[]
const SCHOOL = /@(babson|olin|wellesley)\.edu$/i

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth()
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

  async function save(r: Row, change: Partial<Pick<Row, 'level' | 'studioTrained' | 'radioTrained'>>) {
    setError(''); setNote('')
    try {
      await api('/api/admin/users', { uid: r.id, ...change })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, ...change, ...(change.level === 'guest' ? { studioTrained: false, radioTrained: false } : {}) } : x)))
      setNote(`Saved ${r.name || r.email}.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }

  if (!user || !isAdmin) return null
  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r => !needle || `${r.name} ${r.email} ${r.username}`.toLowerCase().includes(needle))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Users</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <span className="text-xs text-br-dk-sub shrink-0">{rows.length} accounts</span>
      </div>
      <p className="text-sm text-br-dk-sub">
        Guest: live radio only. Student: school email, can use the library and request pre-recorded shows. Director: sets show times and approves requests. Admin: runs the station and manages people.
        Radio trained lets a student request live shows and go on air. Studio trained is for the studio. Directors and admins count as both. Owner accounts cannot be changed.
        Only people with a school email can be students, directors or admins.
      </p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or username"
             className="sk-field w-full rounded-xl px-4 py-3 text-sm text-br-dk-text" />
      <ErrorText>{error}</ErrorText>
      {note && <p role="status" className="text-sm text-br-green">{note}</p>}
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-br-dk-sub">No accounts found.</p>}
        {shown.map(r => {
          const school = SCHOOL.test(r.email)
          const fixed = r.you || r.owner
          const high = r.level === 'director' || r.level === 'admin'
          return (
            <div key={r.id} className="sk-raised rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-br-dk-text truncate">{r.name || '(no name)'}{r.username ? ` · @${r.username}` : ''}</p>
                <p className="text-xs text-br-dk-sub truncate">{r.email}{r.owner ? ' · owner' : ''}</p>
              </div>
              {fixed ? (
                <span className="text-xs text-br-dk-sub shrink-0">{r.you ? 'You · ' : ''}{LEVEL_LABEL[r.level]}</span>
              ) : (
                <div className="flex items-center gap-3 shrink-0">
                  {r.level !== 'guest' && (
                    <>
                      <label className="text-xs text-br-dk-sub flex items-center gap-1">
                        <input type="checkbox" checked={high || r.radioTrained} disabled={high} onChange={e => save(r, { radioTrained: e.target.checked })} /> Radio
                      </label>
                      <label className="text-xs text-br-dk-sub flex items-center gap-1">
                        <input type="checkbox" checked={high || r.studioTrained} disabled={high} onChange={e => save(r, { studioTrained: e.target.checked })} /> Studio
                      </label>
                    </>
                  )}
                  <select value={r.level} onChange={e => save(r, { level: e.target.value as Level })} aria-label={`Level for ${r.name || r.email}`}
                          className="sk-field rounded-lg px-2 py-1.5 text-sm text-br-dk-text">
                    {LEVELS.filter(l => school || l === 'guest').map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
