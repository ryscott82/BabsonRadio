import { opsFont } from '@/components/admin/opsFont'

/** BabsonARTS Settings: the same plain operations look as the admin pages, under the normal site bar. */
export default function ArtsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ops ops-hub ${opsFont.variable} min-h-screen pt-16`}>{children}</div>
}
