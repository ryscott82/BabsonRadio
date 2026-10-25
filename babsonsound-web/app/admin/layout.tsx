import { opsFont } from '@/components/admin/opsFont'

/** Every admin page gets the same plain operations look (light or dark, following the site theme). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ops ${opsFont.variable} min-h-screen`}>{children}</div>
}
