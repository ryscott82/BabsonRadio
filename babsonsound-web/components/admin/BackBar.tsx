'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { FROM_KEY, backTarget, readFromNote, type FromSearch } from '@/lib/adminMenu'

/** Sits at the top of every admin sub-page. It goes back to the tab the page belongs to (not home), or to the tab you searched from. Not shown on the home page. */
export default function BackBar() {
  const path = usePathname()
  const { isAdmin } = useAuth()
  const [from, setFrom] = useState<FromSearch | null>(null)
  useEffect(() => { queueMicrotask(() => { try { setFrom(readFromNote(sessionStorage.getItem(FROM_KEY))) } catch { setFrom(null) } }) }, [path])
  if (path === '/admin') return null
  const to = backTarget(path, isAdmin ? 'admin' : 'director', from)
  return (
    <div className="px-5 lg:px-8 pt-5">
      <Link href={to.href} className="ops-btn inline-flex items-center gap-2 px-4 py-2 min-h-11 no-underline">
        <span aria-hidden>←</span> {to.label}
      </Link>
    </div>
  )
}
