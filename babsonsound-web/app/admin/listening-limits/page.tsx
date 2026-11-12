'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import SettingsBox from '@/components/admin/SettingsBox'

const accept = (k: string) => k.startsWith('limits.')

// Listening (Admins only): when the player asks "still listening?", when it stops, and sleep hours. One set of values covers students and guests
// unless the guest switch is on. Everything else (check-in seconds, the daily limits that are not enforced right now, the monthly hours limit) is in the
// closed Expert fold. E-board and Admins are not stopped by these limits.
export default function ListeningPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [focus] = useState(() => { try { return new URLSearchParams(window.location.search).get('focus') ?? '' } catch { return '' } })
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  if (loading || !user || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="max-w-[1100px] mx-auto px-5 lg:px-10 py-8 space-y-6">
      <header>
        <h1 className="text-4xl font-light leading-tight">Listening</h1>
        <p className="text-base opacity-90 mt-1">Limits for listeners. E-board and Admins are not stopped by them. People already listening get a new number within a minute.</p>
      </header>
      <SettingsBox accept={accept} listening focus={focus} />
    </div>
  )
}
