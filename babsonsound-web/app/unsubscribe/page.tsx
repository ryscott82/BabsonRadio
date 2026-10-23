import { Suspense } from 'react'
import type { Metadata } from 'next'
import Unsubscribe from './Unsubscribe'

export const metadata: Metadata = { title: 'Unsubscribe | Babson Radio', robots: { index: false, follow: false } }

export default function Page() {
  return <Suspense fallback={<div className="min-h-[50vh]" />}><Unsubscribe /></Suspense>
}
