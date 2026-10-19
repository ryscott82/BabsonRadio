'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'
import { ErrorText } from '@/components/AuthUI'

interface P { uid: string; name: string; month: number; day: number; role?: string; daysAway: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

  if (!user || !isAdmin) return null
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em] shrink-0">Birthdays</h1>
        <div className="flex-1 h-px bg-br-dk-border" />
      </div>
      <p className="text-sm text-br-dk-sub">
        Everyone who chose to share a birthday (month and day only), soonest first. Hosts see today&apos;s birthdays in their panel. Please keep this list to station use.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="sk-raised rounded-xl divide-y divide-br-dk-border">
        {people.map(p => (
          <div key={p.uid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-br-dk-text truncate">{p.name}</span>
            <span className="text-br-dk-sub shrink-0 tabular-nums">
              {MONTHS[p.month - 1]} {p.day}{p.daysAway === 0 ? ' · today 🎂' : p.daysAway === 1 ? ' · tomorrow' : ''}
            </span>
          </div>
        ))}
        {!people.length && !error && <p className="px-4 py-3 text-sm text-br-dk-sub">Nobody has shared a birthday yet.</p>}
      </div>
    </div>
  )
}
