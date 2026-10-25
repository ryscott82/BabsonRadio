import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Splash from '@/components/Splash'
import Footer from '@/components/Footer'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import VerifyBanner from '@/components/VerifyBanner'
import LaunchShell from '@/components/launch/LaunchShell'
import GuestFence from '@/components/GuestFence'

// Colors the browser's address bar to match the top bar (not the wood). ThemeToggle and the head script follow the chosen theme.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF8F0' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a09' },
  ],
}

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
  // Pinterest's "Save" button and extension honor this opt-out on every page.
  other: { pinterest: 'nopin', 'pinterest-rich-pin': 'false' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('br-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.removeAttribute('media');m.setAttribute('content',t==='dark'?'#0a0a09':'#FBF8F0')})}}catch(e){}try{var d=document.documentElement,h=new Date().getHours(),n=h>=19||h<6;d.setAttribute('data-night',n?'1':'0');d.setAttribute('data-party','0')}catch(e){}try{d.classList.add('hw-lite');var u=function(){d.classList.remove('hw-lite')};addEventListener('load',function(){setTimeout(u,150)});setTimeout(u,8000)}catch(e){}" }} />
      </head>
      <body className="min-h-dvh flex flex-col bg-br-dk-bg text-br-dk-text">
        <AuthProvider>
          <LaunchShell
            page={children}
            chrome={
              <>
                <GuestFence />
                <Splash />
                <Nav />
                <VerifyBanner />
                <main className="hw-stage hw-main relative z-[1] pt-16 pb-12 flex-1">
                  <AnnouncementBanner />
                  {children}
                </main>
                <Footer />
              </>
            }
          />
        </AuthProvider>
      </body>
    </html>
  )
}
