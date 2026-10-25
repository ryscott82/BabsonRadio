'use client'

import { Pick, MoreButton, usePaged, matchAll } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiDelete, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

type Level = 'guest' | 'student' | 'director' | 'admin'
interface Row { id: string; name: string; username: string; email: string; level: Level; studioTrained: boolean; radioTrained: boolean; owner: boolean; you: boolean }

interface Invite { email: string; level: Level; studioTrained: boolean; radioTrained: boolean }

const LEVEL_LABEL: Record<Level, string> = { guest: 'Guest', student: 'Student', director: 'Director', admin: 'Admin' }
const LEVELS = Object.keys(LEVEL_LABEL) as Level[]
const SCHOOL = /@(babson|olin|wellesley)\.edu$/i

export default function AdminUsersPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newLevel, setNewLevel] = useState<Level>('student')
  const [newRadio, setNewRadio] = useState(false)
  const [newStudio, setNewStudio] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { const d = await apiGet<{ users: Row[]; invites: Invite[] }>('/api/admin/users'); setRows(d.users); setInvites(d.invites ?? []) }
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

  async function addByEmail() {
    setError(''); setNote('')
    const email = newEmail.trim().toLowerCase()
    try {
      const res = await api<{ invited?: boolean }>('/api/admin/users', { email, level: newLevel, studioTrained: newStudio, radioTrained: newRadio })
      setNewEmail(''); setNewRadio(false); setNewStudio(false)
      setNote(res.invited ? `Saved. ${email} gets this when they first sign in with that email.` : `${email} already has an account, so it was updated now.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }
  async function removeInvite(email: string) {
    setError(''); setNote('')
    try { await apiDelete('/api/admin/users', { email }); setInvites(prev => prev.filter(i => i.email !== email)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove.') }
  }

  const [lv, setLv] = useState('')
  const [badge, setBadge] = useState('')
  const filtered = rows.filter(r => matchAll(`${r.name} ${r.email} ${r.username}`, q) && (!lv || r.level === lv) &&
    (!badge || (badge === 'radio' ? r.radioTrained : badge === 'studio' ? r.studioTrained : !r.radioTrained && !r.studioTrained)))
  const paged = usePaged(filtered)
  if (!user || !isAdmin) return null

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
      <div className="sk-raised rounded-xl px-4 py-3 space-y-3">
        <p className="text-sm text-br-dk-text">Give a role to someone who has no account yet</p>
        <div className="flex flex-wrap items-center gap-3">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="name@babson.edu" aria-label="Email address"
                 className="sk-field flex-1 min-w-[14rem] rounded-lg px-3 py-2 text-sm text-br-dk-text" />
          <select value={newLevel} onChange={e => setNewLevel(e.target.value as Level)} aria-label="Level" className="sk-field rounded-lg px-2 py-2 text-sm text-br-dk-text">
            {LEVELS.filter(l => l !== 'guest').map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
          {newLevel === 'student' && (
            <>
              <label className="text-xs text-br-dk-sub flex items-center gap-1"><input type="checkbox" checked={newRadio} onChange={e => setNewRadio(e.target.checked)} /> Radio</label>
              <label className="text-xs text-br-dk-sub flex items-center gap-1"><input type="checkbox" checked={newStudio} onChange={e => setNewStudio(e.target.checked)} /> Studio</label>
            </>
          )}
          <button onClick={addByEmail} disabled={!newEmail.trim()} className="sk-raised rounded-lg px-4 py-2 text-sm text-br-dk-text disabled:opacity-50">Add</button>
        </div>
        <p className="text-xs text-br-dk-sub">School emails only (babson.edu, olin.edu, wellesley.edu). The role applies the first time that email signs in and is verified. If the person already has an account, it changes right away.</p>
        {invites.length > 0 && (
          <ul className="divide-y divide-br-dk-border">
            {invites.map(i => (
              <li key={i.email} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-br-dk-text">{i.email}</span>
                <span className="text-xs text-br-dk-sub shrink-0">{LEVEL_LABEL[i.level]}{i.radioTrained ? ' · radio' : ''}{i.studioTrained ? ' · studio' : ''}</span>
                <button onClick={() => removeInvite(i.email)} className="text-xs text-br-dk-sub underline shrink-0">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="search">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or username" aria-label="Search users"
               className="sk-field flex-1 min-w-[12rem] px-3 py-2 text-sm text-br-dk-text" />
        <Pick value={lv} onChange={setLv} label="Role" options={[['', 'All roles'], ...LEVELS.map(l => [l, LEVEL_LABEL[l]] as [string, string])]} />
        <Pick value={badge} onChange={setBadge} label="Training" options={[['', 'Any training'], ['radio', 'Radio trained'], ['studio', 'Studio trained'], ['none', 'Not trained']]} />
        <span className="text-sm text-br-dk-sub tabular-nums" role="status">{filtered.length === rows.length ? rows.length : `${filtered.length} of ${rows.length}`}</span>
      </div>
      <ErrorText>{error}</ErrorText>
      {note && <p role="status" className="text-sm text-br-green">{note}</p>}
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-br-dk-sub">No accounts found.</p>}
        {paged.items.map(r => {
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
        <MoreButton p={paged} />
      </div>
    </div>
  )
}
