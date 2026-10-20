import type { Metadata } from 'next'
import ComingSoon from './ComingSoon'
import { LAUNCH_ISO } from '@/lib/prelaunch'

export const metadata: Metadata = {
  title: 'Radio is back — Babson Radio',
  description: 'Babson Radio returns October 30.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ComingSoon launchISO={LAUNCH_ISO} />
}
