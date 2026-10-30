'use client'

import { Pick, MoreButton, usePaged, matchAll } from '@/components/admin/FilterBar'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiDelete, apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'
import { gradYearOptions } from '@/lib/terms'

type Level = 'guest' | 'student' | 'director' | 'admin'
interface Row { id: string; name: string; firstName: string; lastName: string; gradYear: string; username: string; email: string; level: Level; studioTrained: boolean; radioTrained: boolean; instagram: string; awaitingVerify: boolean; owner: boolean; you: boolean }

interface Gone { id: string; email: string; name: string; level: string; reason: string; by: string; at: number; done: boolean }
interface Invite { email: string; level: Level; studioTrained: boolean; radioTrained: boolean }

const LEVEL_LABEL: Record<Level, string> = { guest: 'Guest', student: 'Student', director: 'Director', admin: 'Admin' }
const LEVELS = Object.keys(LEVEL_LABEL) as Level[]

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
  // Other admin pages link here with ?q=email to open straight to one person.
  useEffect(() => { const v = new URLSearchParams(location.search).get('q'); if (v) queueMicrotask(() => setQ(v)) }, [])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [target, setTarget] = useState<Row | null>(null) // account being deleted
  const [step, setStep] = useState<1 | 2>(1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [gone, setGone] = useState<Gone[]>([])
  // Editing one person's details (name, graduation year, Instagram).
  const [editId, setEditId] = useState('')
  const [ef, setEf] = useState({ firstName: '', lastName: '', gradYear: '', instagram: '' })
  const [editBusy, setEditBusy] = useState(false)
  const [resetAsk, setResetAsk] = useState(false)
  async function resetSetup(r: Row) {
    setEditBusy(true); setError(''); setNote('')
    try {
      await api('/api/admin/users', { uid: r.id, resetSetup: true })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, name: '', firstName: '', lastName: '', gradYear: '', instagram: '' } : x)))
      setNote(`Setup was reset for ${r.email}. They see the setup steps again the next time they open the site.`)
      setEditId(''); setResetAsk(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reset.') }
    setEditBusy(false)
  }
  function startEdit(r: Row) { setResetAsk(false); setEditId(r.id); setEf({ firstName: r.firstName, lastName: r.lastName, gradYear: r.gradYear, instagram: r.instagram }); setError(''); setNote('') }
  async function saveEdit(r: Row) {
    setEditBusy(true); setError(''); setNote('')
    try {
      const profile: Record<string, string> = { firstName: ef.firstName.trim(), lastName: ef.lastName.trim(), instagram: ef.instagram.trim() }
      if (r.level !== 'guest') profile.gradYear = ef.gradYear
      const res = await api<{ firstName: string; lastName: string; gradYear: string; instagram: string }>('/api/admin/users', { uid: r.id, profile })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, ...res, name: `${res.firstName} ${res.lastName}`.trim() } : x)))
      setNote(`Saved details for ${`${res.firstName} ${res.lastName}`.trim() || r.email}.`)
      setEditId('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
    setEditBusy(false)
  }

  const load = useCallback(async () => {
    try { const d = await apiGet<{ users: Row[]; invites: Invite[] }>('/api/admin/users'); setRows(d.users); setInvites(d.invites ?? []) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load users.') }
  }, [])

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  const loadGone = useCallback(() => { apiGet<{ log: Gone[] }>('/api/admin/users/delete').then(r => setGone(r.log)).catch(() => {}) }, [])
  useEffect(() => { if (user && isAdmin) queueMicrotask(() => { load(); loadGone() }) }, [user, isAdmin, load, loadGone])

  async function clearInstagram(r: Row) {
    setError(''); setNote('')
    try {
      await api('/api/admin/users', { uid: r.id, clearInstagram: true })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, instagram: '' } : x)))
      setNote(`Cleared the Instagram handle for ${r.name || r.email}.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not clear it.') }
  }
  function startDelete(r: Row) { setTarget(r); setStep(1); setReason(''); setError('') }
  async function confirmDelete() {
    if (!target) return
    setBusy(true); setError('')
    try {
      await api('/api/admin/users/delete', { uid: target.id, reason: reason.trim(), confirmed: true })
      setRows(prev => prev.filter(x => x.id !== target.id))
      setNote(`Deleted ${target.name || target.email}.`)
      setTarget(null); loadGone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete.') }
    setBusy(false)
  }

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
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Users</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
        <span className="text-xs text-br-dk-sub shrink-0">{rows.length} accounts</span>
      </div>
      <p className="text-sm text-br-dk-sub">
        Guest: live radio only. Student: school email, can use the library and request pre-recorded shows. Director: sets show times and approves requests. Admin: runs the station and manages people.
        Radio trained lets a student request live shows and go on air. Studio trained is for the studio. Directors and admins count as both. Owner accounts cannot be changed.
        Any email can be given a role. A school email (babson.edu, olin.edu, wellesley.edu) becomes a Student on its own; any other email stays a Guest until you give it a role, and the role works once that email is verified.
      </p>
      <div className="sk-raised rounded-xl px-4 py-3 space-y-3">
        <p className="text-sm text-br-dk-text">Give a role to someone who has no account yet</p>
        <div className="flex flex-wrap items-center gap-3">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="name@example.com" aria-label="Email address"
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
        <p className="text-xs text-br-dk-sub">Any email works. The role is attached when they sign up and starts once they verify their email. If the person already has an account, it changes right away.</p>
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
          const fixed = r.you || r.owner
          const high = r.level === 'director' || r.level === 'admin'
          return (
            <div key={r.id} className="sk-raised rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-br-dk-text truncate">{r.name || '(no name)'}{r.username ? ` · @${r.username}` : ''}</p>
                <p className="text-xs text-br-dk-sub truncate">{r.email}{r.owner ? ' · owner' : ''}{r.awaitingVerify ? ' · role starts when the email is verified' : ''}</p>
                {(!r.owner || r.you) && <button type="button" onClick={() => (editId === r.id ? setEditId('') : startEdit(r))} aria-expanded={editId === r.id}
                        className="text-xs text-br-dk-sub underline" aria-label={`Edit details for ${r.name || r.email}`}>{editId === r.id ? 'Close' : 'Edit details'}</button>}
                {r.instagram && (
                  <p className="text-xs text-br-dk-sub truncate">
                    Instagram @{r.instagram} (not checked){' '}
                    <button type="button" onClick={() => clearInstagram(r)} className="underline" aria-label={`Clear Instagram handle for ${r.name || r.email}`}>Clear</button>
                  </p>
                )}
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
                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                  </select>
                  <button type="button" onClick={() => startDelete(r)} className="text-sm text-red-400 underline" aria-label={`Delete account for ${r.name || r.email}`}>Delete</button>
                </div>
              )}
              {editId === r.id && (
                <div className="basis-full border-t border-br-dk-border pt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-br-dk-sub space-y-1 block">First name
                    <input value={ef.firstName} onChange={e => setEf({ ...ef, firstName: e.target.value })} maxLength={40} className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" /></label>
                  <label className="text-xs text-br-dk-sub space-y-1 block">Last name
                    <input value={ef.lastName} onChange={e => setEf({ ...ef, lastName: e.target.value })} maxLength={60} className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" /></label>
                  {r.level !== 'guest' && (
                    <>
                      <label className="text-xs text-br-dk-sub space-y-1 block">Graduation year
                        <select value={ef.gradYear} onChange={e => setEf({ ...ef, gradYear: e.target.value })} className="sk-field w-full rounded-lg px-2 py-2 text-sm text-br-dk-text">
                          <option value="">Not set</option>
                          {gradYearOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select></label>
                      <label className="text-xs text-br-dk-sub space-y-1 block">Instagram
                        <input value={ef.instagram} onChange={e => setEf({ ...ef, instagram: e.target.value })} maxLength={200} placeholder="@name or link" autoCapitalize="none" spellCheck={false}
                               className="sk-field w-full rounded-lg px-3 py-2 text-sm text-br-dk-text" /></label>
                    </>
                  )}
                  <div className="sm:col-span-2 flex flex-wrap gap-3 justify-end items-center">
                    {resetAsk
                      ? <span className="text-xs text-br-dk-sub mr-auto">Clears name, color, birthday, grad year, phone and Instagram. <button type="button" onClick={() => resetSetup(r)} disabled={editBusy} className="underline text-red-400">Yes, reset</button> · <button type="button" onClick={() => setResetAsk(false)} className="underline">No</button></span>
                      : <button type="button" onClick={() => setResetAsk(true)} className="text-sm text-br-dk-sub underline mr-auto">Reset setup</button>}
                    <button type="button" onClick={() => setEditId('')} className="text-sm text-br-dk-sub underline">Cancel</button>
                    <button type="button" onClick={() => saveEdit(r)} disabled={editBusy || !ef.firstName.trim()} className="sk-raised rounded-lg px-4 py-2 text-sm text-br-dk-text disabled:opacity-50">{editBusy ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <MoreButton p={paged} />
      </div>

      {target && (
        <div role="dialog" aria-modal="true" aria-labelledby="del-title" className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="sk-raised rounded-xl p-6 max-w-md w-full space-y-4">
            {step === 1 ? (
              <>
                <h2 id="del-title" className="text-xl text-br-dk-text">Delete this account?</h2>
                <p className="text-sm text-br-dk-sub"><strong className="text-br-dk-text">{target.name || '(no name)'}</strong><br />{target.email}<br />{LEVEL_LABEL[target.level]}</p>
                <p className="text-sm text-br-dk-sub">This removes their profile, requests, saved data and sign-in.</p>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setTarget(null)} className="text-sm text-br-dk-sub underline">Cancel</button>
                  <button type="button" onClick={() => setStep(2)} className="rounded-lg px-4 py-2 text-sm bg-red-700 text-white">Yes, continue</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="del-title" className="text-xl text-br-dk-text">Are you absolutely sure?</h2>
                <p className="text-sm text-br-dk-sub">This cannot be undone. Deleting {target.email} is saved in the log with your name and the reason below.</p>
                <label htmlFor="del-reason" className="text-sm text-br-dk-text block">Why are you deleting this account?</label>
                <textarea id="del-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} autoFocus
                  className="sk-field w-full rounded-xl px-3 py-2 text-sm text-br-dk-text focus:outline-none" />
                <p className="text-xs text-br-dk-sub">At least 10 characters.</p>
                <ErrorText>{error}</ErrorText>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setTarget(null)} className="text-sm text-br-dk-sub underline">Cancel</button>
                  <button type="button" onClick={confirmDelete} disabled={busy || reason.trim().length < 10}
                    className="rounded-lg px-4 py-2 text-sm bg-red-700 text-white disabled:opacity-40">{busy ? 'Deleting…' : 'Delete permanently'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <details className="sk-raised rounded-xl px-4 py-3">
        <summary className="text-sm text-br-dk-text cursor-pointer">Deleted accounts ({gone.length})</summary>
        <ul className="mt-3 space-y-3">
          {gone.length === 0 && <li className="text-sm text-br-dk-sub">No accounts have been deleted by an admin.</li>}
          {gone.map(g => (
            <li key={g.id} className="text-sm">
              <p className="text-br-dk-text">{g.name || '(no name)'} · {g.email}{g.done ? '' : ' · did not finish'}</p>
              <p className="text-xs text-br-dk-sub">{new Date(g.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} by {g.by || 'an admin'}</p>
              <p className="text-xs text-br-dk-sub whitespace-pre-wrap break-words">Reason: {g.reason}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
