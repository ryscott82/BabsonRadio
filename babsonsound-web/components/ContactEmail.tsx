'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'

// Shows the station's contact email to signed-in people only. Everyone else gets a sign-in link.
export default function ContactEmail({ className = 'text-br-gold underline underline-offset-4' }: { className?: string }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  useEffect(() => {
    if (!user) return
    apiGet<{ email: string }>('/api/contact').then(r => setEmail(r.email)).catch(() => {})
  }, [user])
  if (!user) return <Link href="/auth" className={className}>sign in to see our contact email</Link>
  if (!email) return <span>…</span>
  return <a className={className} href={`mailto:${email}`}>{email}</a>
}
