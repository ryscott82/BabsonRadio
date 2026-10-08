import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import PreviewLock from '@/components/PreviewLock'
import VerifyBanner from '@/components/VerifyBanner'

export const metadata: Metadata = {
  metadataBase: new URL('https://babsonradio.com'),
  title: 'Babson Radio',
  description: 'Student-run internet radio — Babson College',
  openGraph: {
    title: 'Babson Radio',
    description: 'Student-run internet radio — Babson College',
    siteName: 'Babson Radio',
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('br-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}try{var d=document.documentElement,h=new Date().getHours(),n=h>=19||h<6,p=localStorage.getItem('br-party'),t=d.getAttribute('data-theme'),k=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);d.setAttribute('data-night',n?'1':'0');d.setAttribute('data-party',(n&&(p==='on'||(p!=='off'&&k)))?'1':'0')}catch(e){}" }} />
      </head>
      <body className="min-h-screen bg-br-dk-bg text-br-dk-text">
        <PreviewLock />
        <AuthProvider>
          <Nav />
          <VerifyBanner />
          <main className="relative z-[1] pt-16">
            <AnnouncementBanner />
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
