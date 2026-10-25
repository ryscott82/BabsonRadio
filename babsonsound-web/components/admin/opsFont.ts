import { Open_Sans } from 'next/font/google'

// Admin font: the real Segoe UI where it exists (Windows), Open Sans everywhere else (see the end of globals.css).
export const opsFont = Open_Sans({ subsets: ['latin'], weight: ['300', '400'], display: 'swap', variable: '--font-ops' })
