import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Nav from '@/components/Nav'
import Splash from '@/components/Splash'
import Footer from '@/components/Footer'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import SetupBanner from '@/components/setup/SetupBanner'
import SetupPrompt from '@/components/setup/SetupPrompt'
import LaunchShell from '@/components/launch/LaunchShell'
import GuestFence from '@/components/GuestFence'
import { THEME_SCRIPT } from '@/lib/themeScript'

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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
                <SetupBanner />
                <SetupPrompt />
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
