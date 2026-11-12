'use client'

import FilterBar, { MoreButton, useFilter, usePaged } from '@/components/admin/FilterBar'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface P { uid: string; name: string; month: number; day: number; role?: string; daysAway: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const textOf = (p: P) => `${p.name} ${p.role ?? ''} ${MONTHS[p.month - 1]} ${p.day}`

export default function AdminBirthdaysPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [people, setPeople] = useState<P[]>([])
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => {
    if (!user || !isAdmin) return
    apiGet<{ people: P[] }>('/api/admin/birthdays').then(r => setPeople(r.people)).catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [user, isAdmin])

  const f = useFilter(people, textOf)
  const paged = usePaged(f.items)
  if (!user || !isAdmin) return null
  return (
    <div className="px-5 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Birthdays</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Month and day only, soonest first. Station use only.
      </p>
      <ErrorText>{error}</ErrorText>
      <FilterBar f={f} total={people.length} placeholder="Search name or month" />
      <div className="sk-raised rounded-xl divide-y divide-br-dk-border">
        {paged.items.map(p => (
          <div key={p.uid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-br-dk-text truncate">{p.name}</span>
            <span className="text-br-dk-sub shrink-0 tabular-nums">
              {MONTHS[p.month - 1]} {p.day}{p.daysAway === 0 ? ' · today 🎂' : p.daysAway === 1 ? ' · tomorrow' : ''}
            </span>
          </div>
        ))}
        {!people.length && !error && <p className="px-4 py-3 text-sm text-br-dk-sub">Nobody has shared a birthday yet.</p>}
      </div>
      <MoreButton p={paged} />
    </div>
  )
}
