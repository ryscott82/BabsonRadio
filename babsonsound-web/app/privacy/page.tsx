import type { Metadata } from 'next'
import ContactEmail from '@/components/ContactEmail'
import { INSTAGRAM_URL, LINKS } from '@/lib/links'

export const metadata: Metadata = { title: 'Privacy | Babson Radio', description: 'What Babson Radio may collect and how it may be used.' }

const UPDATED = 'October 28, 2026'

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
  const email = <ContactEmail className={a} />
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.08em]">Privacy</h1>
        <p className="text-sm text-br-dk-muted mt-1">Last updated {UPDATED}</p>
      </div>

      <p className="text-sm text-br-dk-sub leading-relaxed">
        Babson Radio is a student-run internet radio station run by Babson Sound, a student organization at Babson College, with a website and an iPhone app.
        This page describes information we may collect and how we may use it. Babson College&apos;s{' '}
        <a className={a} href={LINKS.babsonPrivacy} target="_blank" rel="noopener noreferrer">privacy policy</a> may also apply
        to your use of Babson Radio.
      </p>

      <Section title="What we collect">
        <p>We may collect the following, and other information you give us or that our systems record when you use Babson Radio.</p>
        <p><strong className="text-br-dk-text">Account details:</strong> your name, email, username and password. Guests give an email and a name.</p>
        <p><strong className="text-br-dk-text">Optional details:</strong> a profile color, graduation year, phone number, Instagram handle, and birthday or age range. Some of this may be shown to other members now or in a later update. Friends might be able to see this information.</p>
        <p><strong className="text-br-dk-text">Activity:</strong> shows you set reminders for, shows and songs you like, reactions, ratings, votes, song suggestions, show requests, set lists and show update requests, messages, and listening activity and logs, including when and how long you listen, which show was on, the device type, and the account it came from. Friends might be able to see this information where it is shown in the app.</p>
        <p><strong className="text-br-dk-text">Reports:</strong> if you send a bug report or feature idea, we may keep your message, name, email, the page you were on and your browser or app version.</p>
        <p><strong className="text-br-dk-text">Contacts (optional):</strong> if you choose to share your contacts, we may receive and store phone numbers and email addresses from your contacts, in the form we receive them or in a converted form, and link them to your account. Only share contacts you are entitled to share.</p>
        <p><strong className="text-br-dk-text">Friends on the app:</strong> when you and another member each have the other&apos;s number saved, the app may connect you as friends. Station staff can see these connections by name. Friends might be able to see this information.</p>
        <p><strong className="text-br-dk-text">Device and technical data:</strong> IP address, device details, and a push notification token if you turn on notifications. Our streaming, hosting and advertising providers also receive this data.</p>
        <p><strong className="text-br-dk-text">Embedded content:</strong> some pages embed content from our service providers, which can change at any time. They may collect data under their own policies.</p>
      </Section>

      <Section title="How we use it">
        <p>We use information to run, secure, personalize, analyze and improve Babson Radio, including features we add in the future; to measure how the service is used, such as listening time, which shows and features people use, and where sign-up gets stuck; to record errors and crashes; to enforce our <a className={a} href="/terms">Terms of Use</a>; to comply with the law and with Babson College policies; and to contact you about your account, the station, launches, events and new features, except where required by law.</p>
      </Section>

      <Section title="Who sees it">
        <p>Other members may see your name or username, profile color, graduation year, Instagram handle, reactions, ratings and other activity, depending on the feature. Friends might be able to see this information. Station staff and administrators can see more, including accounts, reports and the listening log.</p>
        <p>We may share information with Babson College, including your listening hours on belong.babson.edu, to administer its policies, respond to concerns, or as the College requests. We may share information with service providers, with law enforcement or others where we think the law or safety requires it, to protect our rights or others&apos; safety, and in connection with a transfer of Babson Radio to another organization.</p>
        <p>We use service providers, which can change at any time without notice, to host, stream, store, analyze and deliver Babson Radio, including our audio stream. By using Babson Radio you agree that each of them may receive your IP address and device data, may see what you listen to and your listening activity, and may collect and use data under its own policy. The stream may include advertisements, and a provider may choose ads using your estimated location or other connection data. We do not control which advertisements are played to you.</p>
      </Section>

      <Section title="Deleting information">
        <p>We may keep some information after an account is deleted, including logs, activity records and backups. To ask us to delete information about you, contact us as described below. We may decline or limit a request, except where required by law. You can turn off contacts access in your phone&apos;s settings.</p>
        <p>Recordings may be limited to Babson students. A host who is 18 or older may choose to make a show or recording public, which involves a signed agreement; we keep that record (name typed, date and agreement version). Copies that others have already saved cannot be removed.</p>
      </Section>

      <Section title="Age">
        <p>Babson Radio is not for children under 13. If we learn that an account belongs to someone under 13, we may delete it and its information, except where required by law. People aged 13 to 17 need a parent or guardian&apos;s permission. Our <a className={a} href="/terms">Terms of Use</a> explain the rules for using the service.</p>
      </Section>

      <Section title="Security and region">
        <p>We do not guarantee the security of your information, and you share information at your own risk, except where required by law. Babson Radio is intended for people in the United States. If you use it from elsewhere, you are responsible for complying with local law.</p>
      </Section>

      <Section title="Changes and questions">
        <p>We may update this page at any time without notice. We may, but are not required to, notify you of changes. Continued use means you accept the updated policy.</p>
        <p>
          Send a bug report or idea from your profile, or reach us on{' '}
          {INSTAGRAM_URL ? <a className={a} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a> : 'Instagram'}
          {email ? <>, or email {email}</> : ''}.
        </p>
      </Section>
    </div>
  )
}
