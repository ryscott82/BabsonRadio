'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import HostGate from '@/components/HostGate'

export default function TrainingPage() {
  const { user, isBabson, loading } = useAuth()
  const member = !!user && isBabson
  if (loading) return null
  if (!member) return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host training</h1>
      <p className="text-sm text-br-dk-sub">Training is for verified Babson students. <Link href="/auth" className="text-br-gold">Sign in</Link> with your Babson email.</p>
    </div>
  )
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Host training</h1>
      <HostGate>
        <div className="sk-raised rounded-2xl p-5 space-y-2">
          <p className="text-sm text-br-green">You are certified.</p>
          <Link href="/slots" className="text-sm text-br-gold">Request a slot</Link>
        </div>
      </HostGate>
    </div>
  )
}
