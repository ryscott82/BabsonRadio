'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { roleLabel } from '@/lib/roleLabel'
import { trainingWords } from '@/lib/userProfileView'

interface Training { trained: boolean; expired: boolean; until: number | null }
interface Profile { name: string; gradYear: string; level: string; radio: Training; studio: Training; shows: { id: string; title: string; startAt: number; type: string; status: string }[]; counts: { total: number; approved: number; declined: number; pending: number } }

const when = (ms: number) => (ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

// A person's profile for staff (E-board and Admin): role, training and show history. One read when it opens. No email, phone or Instagram.
export default function PersonPage() {
  const { uid } = useParams<{ uid: string }>()
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  const [p, setP] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  useEffect(() => {
    if (!user || !isDirector) return
    apiGet<Profile>(`/api/admin/users/profile?uid=${encodeURIComponent(uid)}`).then(setP).catch(e => setError(e instanceof Error ? e.message : 'Could not load this person.'))
  }, [user, isDirector, uid])
  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />

  return (
    <div className="px-5 lg:px-8 py-6 space-y-6">
      {error && <p role="alert" className="ops-card p-4 text-base">{error}</p>}
      {!p && !error && <div className="ops-card min-h-[8rem] p-4" aria-busy="true" />}
      {p && (
        <>
          <header>
            <h1 className="text-4xl font-light leading-tight">{p.name}</h1>
            <p className="text-base opacity-90">{roleLabel(p.level as 'guest' | 'student' | 'director' | 'admin')}{p.gradYear ? ` · Class of ${p.gradYear}` : ''}</p>
          </header>
          <div className="grid lg:grid-cols-[22rem_minmax(0,1fr)] gap-6 items-start">
            <section className="ops-card p-5 space-y-3" aria-label="Training">
              <h2 className="text-2xl font-light">Training</h2>
              <p className="text-base"><span className="opacity-90">Radio: </span><span className="font-semibold">{trainingWords(p.radio)}</span></p>
              <p className="text-base"><span className="opacity-90">Studio: </span><span className="font-semibold">{trainingWords(p.studio)}</span></p>
              <p className="text-base opacity-90">{p.counts.total} show request{p.counts.total === 1 ? '' : 's'}: {p.counts.approved} approved, {p.counts.declined} declined, {p.counts.pending} waiting.</p>
            </section>
            <section className="ops-card p-5" aria-label="Show history">
              <h2 className="text-2xl font-light mb-2">Show history</h2>
              {p.shows.length === 0 ? <p className="text-base">No show requests yet.</p> : (
                <ul className="divide-y divide-white/25">
                  {p.shows.map(s => (
                    <li key={s.id} className="py-2 text-base flex flex-wrap gap-x-4 gap-y-1">
                      <span className="flex-1 min-w-[12rem] break-words">{s.title}</span>
                      <span className="opacity-90">{when(s.startAt)}</span>
                      <span className="font-semibold capitalize">{s.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
