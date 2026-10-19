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
    <section className="space-y-2">
      <h2 className="font-display text-br-dk-text text-xl tracking-wide">{title}</h2>
      <div className="text-sm text-br-dk-sub space-y-2 leading-relaxed">{children}</div>
    </section>
  )
}

export default function AboutPage() {
  const a = 'text-br-gold underline underline-offset-4'
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.08em]">About us</h1>
        <p className="text-sm text-br-dk-sub mt-2 leading-relaxed">
          Babson Radio is the student-run internet radio station of Babson College, made by the students of Babson Sound.
        </p>
      </div>

      <Section title="What we do">
        <p>We stream live from campus, with student-hosted shows and a rotation of music in between. Open the home page to listen, see what is playing and what is next, and rate songs with stars.</p>
        <p>Everything on the air is chosen and made by students and volunteers. We are not professional broadcasters, and Babson College does not review or endorse what we play.</p>
      </Section>

      <Section title="Listen anywhere">
        <p>Listen on this website or in the Babson Radio app for iPhone. Live radio is free for everyone. A Babson, Olin or Wellesley student can sign in with their school email to unlock the Library and the rest, and can invite friends to listen as guests.</p>
        <p>See what is on and when in the <Link href="/schedule" className={a}>schedule</Link>, and browse the <Link href="/shows" className={a}>shows</Link>.</p>
      </Section>

      <Section title="Be on the air">
        <p>Anyone at Babson can host a show, from a music hour to a talk show to a one-off special. We train new hosts and help with the equipment. Tell us what you would like to make on the <a href={LINKS.interest} target="_blank" rel="noopener noreferrer" className={a}>interest form</a>.</p>
      </Section>

      <Section title="Babson Sound">
        <p>Babson Radio is run by Babson Sound, a student organization at Babson College. Learn more, see events, or join on our <a href={LINKS.about} target="_blank" rel="noopener noreferrer" className={a}>Babson Sound page</a>.</p>
      </Section>

      <Section title="Get in touch">
        <p>
          Questions, song requests or ideas? Email <ContactEmail className={a} />
          {INSTAGRAM_URL && <>, or find us on <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={a}>Instagram</a></>}.
        </p>
        <p>Read our <Link href="/terms" className={a}>terms</Link> and <Link href="/privacy" className={a}>privacy policy</Link>.</p>
      </Section>
    </div>
  )
}
