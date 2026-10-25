import { Open_Sans } from 'next/font/google'

// The clean sans for the radio operations screens, close to Windows' Segoe UI. Windows itself uses the real Segoe UI first (see .ops in globals.css).
export const opsFont = Open_Sans({ subsets: ['latin'], weight: ['300', '400', '600', '700'], display: 'swap', variable: '--font-ops' })
