import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Studio · Babson Radio', robots: { index: false, follow: false } }

export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return children
}
