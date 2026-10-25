'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import ArtTest from '@/components/admin/ArtTest'

export default function TestsPage() {
  const { isAdmin, loading } = useAuth()
  if (loading || !isAdmin) return <div className="min-h-[60vh]" />
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-br-dk-border pb-3">
        <Link href="/admin" className="text-br-dk-sub text-sm">radio-ops</Link>
        <span className="text-br-dk-muted">/</span>
        <h1 className="text-br-dk-text text-base font-semibold">tests</h1>
      </div>
      <ArtTest />
    </div>
  )
}
