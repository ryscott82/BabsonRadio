import Link from 'next/link'
import { GUIDES, TOOLS } from '@/lib/memberResources'

/** Tools (the Explicit phrase reference first) and the how-to and troubleshooting guides. */
export default function ResourcesCard({ trained }: { trained: boolean }) {
  return (
    <div className="space-y-5">
      <ul className="space-y-3" aria-label="Tools">
        {TOOLS.map(t => (
          <li key={t.href}>
            {t.trained && !trained
              ? <p className="text-base text-br-dk-sub"><span className="text-br-dk-text">{t.title}</span>: {t.summary} Opens once you finish the training.</p>
              : <p className="text-base text-br-dk-sub"><Link href={t.href} className="text-br-gold underline underline-offset-4">{t.title}</Link>: {t.summary}</p>}
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <h3 className="text-br-dk-text text-lg">Guides</h3>
        <ul className="space-y-2">
          {GUIDES.map(g => (
            <li key={g.slug} className="text-base text-br-dk-sub">
              <Link href={`/members/guides/${g.slug}`} className="text-br-gold underline underline-offset-4">{g.title}</Link>: {g.summary}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
