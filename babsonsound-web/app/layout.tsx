import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import PreviewLock from '@/components/PreviewLock'

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('br-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}" }} />
      </head>
      <body className="min-h-screen bg-br-dk-bg text-br-dk-text">
        <PreviewLock />
        <AuthProvider>
          <Nav />
          <main className="pt-16">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
