import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Babson Radio',
  description: 'Student-run internet radio — Babson College',
  openGraph: {
    title: 'Babson Radio',
    description: 'Student-run internet radio — Babson College',
    siteName: 'Babson Radio',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-br-dk-bg text-br-dk-text">
        <AuthProvider>
          <Nav />
          <main className="pt-16">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
