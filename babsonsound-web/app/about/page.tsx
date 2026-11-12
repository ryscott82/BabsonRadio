import type { Metadata } from 'next'
import Link from 'next/link'
import ContactEmail from '@/components/ContactEmail'
import { INSTAGRAM_URL } from '@/lib/links'
import Rich from '@/components/Rich'
import { loadSiteText } from '@/lib/server/siteText'
import { lines, txt } from '@/lib/siteText'

export const metadata: Metadata = {
  title: 'About us | Babson Radio',
  description: 'Babson Radio is the first all-internet radio station in the United States, run by students at Babson College since 1998 and made by Babson Sound.',
}

export const revalidate = 60 // admins can change these words (Settings > Page text); the page picks them up within a minute

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-br-dk-text text-3xl tracking-wide">{title}</h2>
      <ul className="text-lg text-br-dk-text space-y-2">
        {items.map((l, i) => l.startsWith('~')
          ? <li key={i} className="text-base text-br-dk-sub"><Rich text={l.replace(/^~\s*/, '')} /></li>
          : <li key={i}><Rich text={l} /></li>)}
      </ul>
    </section>
  )
}

export default async function AboutPage() {
  const t = await loadSiteText()
  const a = 'text-br-gold underline underline-offset-4'
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
      <div>
        <h1 className="font-display text-br-dk-text text-5xl sm:text-6xl tracking-[0.06em]">{txt(t, 'about.title')}</h1>
        <p className="text-xl text-br-dk-sub mt-3">{txt(t, 'about.subtitle')}</p>
      </div>

      <Section title={txt(t, 'about.what.title')} items={lines(t, 'about.what.items')} />
      <Section title={txt(t, 'about.listen.title')} items={lines(t, 'about.listen.items')} />
      <Section title={txt(t, 'about.host.title')} items={lines(t, 'about.host.items')} />
      <Section title={txt(t, 'about.sound.title')} items={lines(t, 'about.sound.items')} />

      <section className="space-y-3">
        <h2 className="font-display text-br-dk-text text-3xl tracking-wide">{txt(t, 'about.contact.title')}</h2>
        <ul className="text-lg text-br-dk-text space-y-2">
          <li><ContactEmail className={a} /></li>
          {INSTAGRAM_URL && <li><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={a}>Instagram</a></li>}
          <li className="text-base"><Link href="/terms" className={a}>Terms</Link> · <Link href="/privacy" className={a}>Privacy</Link> · <Link href="/support" className={a}>Support</Link></li>
        </ul>
      </section>
    </div>
  )
}
