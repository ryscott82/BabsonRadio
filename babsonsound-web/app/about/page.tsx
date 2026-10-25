import type { Metadata } from 'next'
import Link from 'next/link'
import ContactEmail from '@/components/ContactEmail'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'

export const metadata: Metadata = {
  title: 'About us | Babson Radio',
  description: 'Babson Radio is the student-run internet radio station of Babson College, made by Babson Sound.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-br-dk-text text-3xl tracking-wide">{title}</h2>
      <ul className="text-lg text-br-dk-text space-y-2">{children}</ul>
    </section>
  )
}

export default function AboutPage() {
  const a = 'text-br-gold underline underline-offset-4'
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
      <div>
        <h1 className="font-display text-br-dk-text text-5xl sm:text-6xl tracking-[0.06em]">About us</h1>
        <p className="text-xl text-br-dk-sub mt-3">The student-run radio station of Babson College.</p>
      </div>

      <Section title="What we do">
        <li>Live shows from campus</li>
        <li>Music in between</li>
        <li>Made by students and volunteers</li>
        <li className="text-base text-br-dk-sub">Babson College does not review or endorse what we play.</li>
      </Section>

      <Section title="Listen">
        <li>On this website or in the iPhone app</li>
        <li>Live radio is free for everyone</li>
        <li>Babson, Olin and Wellesley students sign in with their school email for the rest</li>
        <li>Check the <Link href="/schedule" className={a}>schedule</Link> and browse the <Link href="/shows" className={a}>shows</Link></li>
      </Section>

      <Section title="Be on the air">
        <li>Anyone at Babson can host a show</li>
        <li>We train you and help with the equipment</li>
        <li>Email us what you want to make</li>
      </Section>

      <Section title="Babson Sound">
        <li>The student organization that runs Babson Radio</li>
        <li><a href={LINKS.about} target="_blank" rel="noopener noreferrer" className={a}>See events and join</a></li>
      </Section>

      <Section title="Contact">
        <li><ContactEmail className={a} /></li>
        {INSTAGRAM_URL && <li><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={a}>Instagram</a></li>}
        <li className="text-base"><Link href="/terms" className={a}>Terms</Link> · <Link href="/privacy" className={a}>Privacy</Link></li>
      </Section>
    </div>
  )
}
