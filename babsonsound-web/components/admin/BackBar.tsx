'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Sits at the top of every admin sub-page. Not shown on the operations home. */
export default function BackBar() {
  const path = usePathname()
  if (path === '/admin') return null
  const inLibrary = path.startsWith('/admin/music-library/') // its sub-pages go back to the Music library page
  return (
    <div className="max-w-[1800px] mx-auto px-5 lg:px-10 pt-5">
      <Link href={inLibrary ? '/admin/music-library' : '/admin'} className="ops-btn inline-flex items-center gap-2 px-4 py-2 no-underline">
        <span aria-hidden>←</span> {inLibrary ? 'Music library' : 'Back'}
      </Link>
    </div>
  )
}
