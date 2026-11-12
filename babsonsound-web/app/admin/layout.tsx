import AdminShell from '@/components/admin/AdminShell'
import BackBar from '@/components/admin/BackBar'
import UsageBanner from '@/components/admin/UsageBanner'
import { opsFont } from '@/components/admin/opsFont'

/** Every admin page gets the same plain operations look (light or dark, following the site theme) and the same left menu, which never goes away. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ops ops-hub ${opsFont.variable} min-h-screen`}><UsageBanner /><AdminShell><BackBar />{children}</AdminShell></div>
}
