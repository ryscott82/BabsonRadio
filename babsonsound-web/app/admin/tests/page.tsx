'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import ArtTest from '@/components/admin/ArtTest'
import StationPanel from '@/components/admin/StationPanel'

export default function TestsPage() {
  const { isAdmin, loading } = useAuth()
  if (loading || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="ops-hub">
      <div className="max-w-[1800px] mx-auto px-5 lg:px-10 py-8 space-y-6">
        <header>
          <Link href="/admin" className="text-base underline underline-offset-4">Radio operations</Link>
          <h1 className="text-4xl font-light leading-tight mt-1">Tests</h1>
        </header>
        <StationPanel only="tests" />
        <ArtTest />
      </div>
    </div>
  )
}
