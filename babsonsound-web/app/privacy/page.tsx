import type { Metadata } from 'next'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'

export const metadata: Metadata = { title: 'Privacy | Babson Radio', description: 'What Babson Radio collects, why, and your choices.' }

const UPDATED = 'October 7, 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-br-dk-text text-xl tracking-wide">{title}</h2>
      <div className="text-sm text-br-dk-sub space-y-2 leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  const a = 'text-br-gold underline underline-offset-4'
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.08em]">PRIVACY</h1>
        <p className="text-xs text-br-dk-muted mt-1">Last updated {UPDATED}</p>
      </div>

      <p className="text-sm text-br-dk-sub leading-relaxed">
        Babson Radio is a student-run internet radio station run by Babson Sound at Babson College, with a website and an iPhone app.
        This page explains what we collect and why. Babson College&apos;s{' '}
        <a className={a} href={LINKS.babsonPrivacy} target="_blank" rel="noopener noreferrer">privacy policy</a> also applies
        to your use of Babson Radio.
      </p>

      <Section title="What we collect">
        <p><strong className="text-br-dk-text">Account details:</strong> your first and last name, school email, phone number and username, and your password (kept by our sign-in provider, never readable by us). Guests give an email and a name.</p>
        <p><strong className="text-br-dk-text">What you do in the service:</strong> shows you set reminders for, shows and songs you like, and, while you listen signed in, that you are tuned in (so friends can see it).</p>
        <p><strong className="text-br-dk-text">Hosts:</strong> set lists and show update requests you submit.</p>
        <p><strong className="text-br-dk-text">Reports:</strong> if you send a bug report or feature idea, we keep your message, name, email, the page you were on and your browser or app version.</p>
        <p><strong className="text-br-dk-text">Contacts (optional):</strong> if you choose to find friends from your contacts, your phone turns each number into a scrambled code before it leaves your device. We compare those codes with members&apos; codes and keep a match only when it is a member. We do not keep your address book, names, or the numbers that did not match.</p>
      </Section>

      <Section title="How we measure use">
        <p>We measure how the service is used, such as listening time, which shows and features people use, and where sign-up gets stuck, so we can improve it. This uses an anonymous ID, not your name or email. Invisible mode hides you from other people. It does not stop this measurement.</p>
        <p>We also record errors and crashes to fix them.</p>
      </Section>

      <Section title="Who sees it">
        <p>Other members only see your first name, and only if you are connected and not invisible. Station staff can see accounts and reports to run the station. We do not sell your information or show ads.</p>
        <p>We use these services to run Babson Radio: Google Firebase (sign-in and our database), Vercel (the website), Asura Hosting (the audio stream, which sees listeners&apos; IP addresses), and YouTube for embedded video, which has its own privacy policy.</p>
      </Section>

      <Section title="Your choices">
        <p>You can edit your name, turn on invisible mode, and delete your account from your profile. Deleting removes your account and profile. Syncing contacts is always your choice, and you can turn off contacts access in your phone&apos;s settings.</p>
        <p>Babson Radio is for people 13 and older. Our <a className={a} href="/terms">Terms of Use</a> explain the rules for using the service.</p>
      </Section>

      <Section title="Questions">
        <p>
          Send a bug report or idea from your profile, or reach us on{' '}
          {INSTAGRAM_URL ? <a className={a} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a> : 'Instagram'}.
          We will update this page when something changes and change the date above.
        </p>
      </Section>
    </div>
  )
}
