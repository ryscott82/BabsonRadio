'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import Telemetry from '@/components/admin/Telemetry'

export default function StatsPage() {
  const { isAdmin, isDirector, loading } = useAuth()
  if (loading || !isDirector) return <div className="min-h-[60vh]" />
  const links: [string, string][] = [
    ['/admin/insights', 'What listeners like'],
    ...(isAdmin ? ([['/admin/usage', 'Listening hours'], ['/admin/listening', 'Listening log'], ['/admin/playlog', 'Play log (export)'], ['/admin/network', 'Friends web']] as [string, string][]) : []),
  ]
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-br-dk-border pb-3">
        <Link href="/admin" className="text-br-dk-sub text-sm">radio-ops</Link>
        <span className="text-br-dk-muted">/</span>
        <h1 className="text-br-dk-text text-base font-semibold">stats</h1>
      </div>
      <section className="sk-raised p-4">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          {links.map(([href, label]) => <li key={href}><Link href={href} className="text-br-dk-text hover:text-br-gold">{label}</Link></li>)}
        </ul>
      </section>
      <Telemetry />
    </div>
  )
}
