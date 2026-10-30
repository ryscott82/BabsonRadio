import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Studio training | Babson Radio', robots: { index: false, follow: false } }

export default function Layout({ children }: { children: React.ReactNode }) { return children }
