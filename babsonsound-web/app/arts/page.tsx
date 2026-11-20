'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import StrikesPanel from '@/components/admin/strikes/StrikesPanel'
import StaffCard from '@/components/arts/StaffCard'
import StudioFormCard from '@/components/arts/StudioFormCard'

/** Settings for BabsonARTS staff (and Admins): issue strikes and bans, add staff, and change the studio form link. Only they see the Settings tab. */
export default function ArtsSettingsPage() {
  const { user, isArts, isAdmin, loading } = useAuth()
  const router = useRouter()
  const allowed = !!user && (isArts || isAdmin)
  useEffect(() => { if (!loading && !allowed) router.replace('/') }, [loading, allowed, router])
  if (loading || !allowed) return <div className="min-h-[60vh]" />
  return (
    <div className="px-5 lg:px-8 py-6 space-y-6 max-w-4xl">
      <h1 className="text-4xl font-light leading-tight">Settings</h1>
      <p className="text-base">A first strike sends an email. A second strike pauses the studio for a week. A third pauses hosting and booking until the semester ends. Only an Admin can excuse a strike.</p>
      <StrikesPanel />
      <StaffCard />
      <StudioFormCard />
    </div>
  )
}
