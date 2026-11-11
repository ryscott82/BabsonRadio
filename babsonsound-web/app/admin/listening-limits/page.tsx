'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { api, apiGet } from '@/lib/auth'
import { hourLabel, type Audience, type Limits } from '@/lib/listenLimits'

interface Info { limits: Limits; updatedAt: number | null }

const NUMBERS: { key: 'idleMin' | 'sessionMaxMin' | 'dailyCapMin' | 'dailyAutoMin'; label: string; help: string }[] = [
  { key: 'idleMin', label: 'Ask "still listening?" after (minutes)', help: 'Minutes with no tap or key press. 0 means never ask.' },
  { key: 'sessionMaxMin', label: 'Stop listening after (minutes in a row)', help: '0 means no limit.' },
  { key: 'dailyCapMin', label: 'Daily listening limit (minutes)', help: 'Not enforced right now: the server no longer counts listening minutes, to save server time.' },
  { key: 'dailyAutoMin', label: 'Daily playlist limit (minutes)', help: 'Not enforced right now: the server no longer counts listening minutes, to save server time.' },
]
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const field = 'w-full rounded-lg px-3 py-2 text-base bg-black/30 text-white'

function AudienceCard({ title, note, value, onChange }: { title: string; note: string; value: Audience; onChange: (a: Audience) => void }) {
  const set = <K extends keyof Audience>(k: K, v: Audience[K]) => onChange({ ...value, [k]: v })
  return (
    <section className="ops-card p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-light">{title}</h2>
        <p className="text-sm opacity-80">{note}</p>
      </div>
      {NUMBERS.map(n => (
        <label key={n.key} className="block space-y-1">
          <span className="text-base">{n.label}</span>
          <input type="number" inputMode="numeric" min={0} value={value[n.key]} className={field}
                 onChange={e => set(n.key, e.target.value === '' ? 0 : Number(e.target.value))} />
          <span className="block text-sm opacity-80">{n.help}</span>
        </label>
      ))}
      <div className="space-y-2">
        <label className="flex items-center gap-3 text-base">
          <input type="checkbox" className="h-5 w-5" checked={value.quietEnabled} onChange={e => set('quietEnabled', e.target.checked)} />
          Pause playlists overnight (sleep)
        </label>
        <div className="flex items-center gap-3">
          <select aria-label={`${title} sleep starts`} value={value.quietStart} disabled={!value.quietEnabled} onChange={e => set('quietStart', Number(e.target.value))} className={`${field} disabled:opacity-50`}>
            {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <span className="text-base">to</span>
          <select aria-label={`${title} sleep ends`} value={value.quietEnd} disabled={!value.quietEnabled} onChange={e => set('quietEnd', Number(e.target.value))} className={`${field} disabled:opacity-50`}>
            {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <span className="block text-sm opacity-80">Live shows still play. Times are station time.</span>
      </div>
    </section>
  )
}

export default function ListeningLimitsPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [info, setInfo] = useState<Info | null>(null)
  const [draft, setDraft] = useState<Limits | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<Info>('/api/admin/listening-limits').then(r => { setInfo(r); setDraft(r.limits) }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  async function save() {
    if (!draft) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await api<Info>('/api/admin/listening-limits', draft)
      setInfo(r); setDraft(r.limits); setMsg('Saved. New limits apply within a minute.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.') }
    setBusy(false)
  }

  if (loading || !isAdmin || !draft) return null
  const dirty = JSON.stringify(draft) !== JSON.stringify(info?.limits)
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-4xl font-light">Listening limits</h1>
      <p className="text-base opacity-90">Set limits for students and guests separately. Directors and admins follow the student settings and are not stopped by the daily limits or sleep hours. People already listening get the new numbers within a minute.</p>
      {err && <p role="alert" className="text-base">{err}</p>}
      {msg && <p role="status" className="text-base">{msg}</p>}
      <div className="grid md:grid-cols-2 gap-5">
        <AudienceCard title="Students" note="Babson, Olin and Wellesley accounts, plus directors and admins." value={draft.student} onChange={student => setDraft({ ...draft, student })} />
        <AudienceCard title="Guests" note="Everyone with a non-school email." value={draft.guest} onChange={guest => setDraft({ ...draft, guest })} />
      </div>
      <section className="ops-card p-4 space-y-2">
        <label className="flex items-start gap-3 text-lg">
          <input type="checkbox" className="mt-2 h-5 w-5" checked={draft.budgetEnabled} onChange={e => setDraft({ ...draft, budgetEnabled: e.target.checked })} />
          <span>Also use the monthly hours limit<span className="block text-sm opacity-80">Off, because the hosting plan has no hour limit. When on, the limits above get stricter as the month&apos;s listening hours fill up. Set the number of hours on the Listening hours page.</span></span>
        </label>
      </section>
      <div className="flex items-center gap-3">
        <button type="button" disabled={busy || !dirty} onClick={save} className="px-4 h-10 rounded-lg bg-white text-[#0f5233] disabled:opacity-40">Save</button>
        <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(info?.limits ?? draft); setMsg(''); setErr('') }} className="px-4 h-10 rounded-lg border border-white/60 disabled:opacity-40">Undo changes</button>
        {info?.updatedAt && <span className="text-sm opacity-80">Last saved {new Date(info.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
    </div>
  )
}
