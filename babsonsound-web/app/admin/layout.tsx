import { plexMono } from '@/components/admin/opsFont'

/** Every admin page gets the same plain, monospace operations look (light or dark, following the site theme). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ops ${plexMono.className} min-h-screen`}>{children}</div>
}
