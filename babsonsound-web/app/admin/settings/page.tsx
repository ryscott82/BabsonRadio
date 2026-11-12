'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { oldSettingsTarget } from '@/lib/settingsHome'

// The panel is Settings now and every setting lives on the page it controls. Old links to /admin/settings still work: they move on to
// the right page (with the row highlighted for a ?focus= link), or to the System heading.
export default function OldSettingsRedirect() {
  const router = useRouter()
  useEffect(() => {
    let focus: string | null = null
    try { focus = new URLSearchParams(window.location.search).get('focus') } catch { /* no address */ }
    router.replace(oldSettingsTarget(focus))
  }, [router])
  return <p className="px-5 lg:px-8 py-8 text-base">Taking you to Settings…</p>
}
