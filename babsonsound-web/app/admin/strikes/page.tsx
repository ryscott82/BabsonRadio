'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import StrikesPanel from '@/components/admin/strikes/StrikesPanel'

// Strikes: missed shows the site noticed, for the E-board to confirm or excuse, plus a manual add. E-board and Admin.
export default function StrikesPage() {
  const { user, isDirector, loading } = useAuth()
  const router = useRouter()
  useEffect(() => { if (!loading && (!user || !isDirector)) router.replace(user ? '/host' : '/') }, [loading, user, isDirector, router])
  if (loading || !user || !isDirector) return <div className="min-h-[60vh]" />
  return (
    <div className="px-5 lg:px-8 py-6 space-y-6 max-w-4xl">
      <h1 className="text-4xl font-light leading-tight">Strikes</h1>
      <p className="text-base">Three levels: a mistake (friendly note), a warning (formal email), then no hosting or booking for the rest of the semester. Nothing is confirmed until you confirm it.</p>
      <StrikesPanel />
    </div>
  )
}
