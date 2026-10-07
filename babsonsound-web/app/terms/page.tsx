import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAIL, INSTAGRAM_URL, LINKS } from '@/lib/links'

export const metadata: Metadata = { title: 'Terms of Use | Babson Radio', description: 'The rules for using Babson Radio.' }

const UPDATED = 'October 7, 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-br-dk-text text-xl tracking-wide">{title}</h2>
      <div className="text-sm text-br-dk-sub space-y-2 leading-relaxed">{children}</div>
    </section>
  )
}

/** Disclaimers, liability limits and the arbitration clause are set apart so they stand out. */
function Loud({ children }: { children: React.ReactNode }) {
  return <p className="uppercase text-xs leading-relaxed text-br-dk-text border-l-2 border-br-gold pl-3">{children}</p>
}

export default function TermsPage() {
  const a = 'text-br-gold underline underline-offset-4'
  const email = CONTACT_EMAIL ? <a className={a} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : null
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.08em]">TERMS OF USE</h1>
        <p className="text-xs text-br-dk-muted mt-1">Last updated {UPDATED}</p>
      </div>

      <p className="text-sm text-br-dk-sub leading-relaxed">
        These terms are an agreement between you and Babson Sound, the student organization that runs Babson Radio. By creating an
        account or using the Babson Radio website or app, you agree to these terms and to our{' '}
        <Link href="/privacy" className={a}>Privacy Policy</Link>. If you do not agree, do not use Babson Radio.
        Please read the sections on disclaimers, limits on liability, misuse, and resolving disputes, which include an arbitration agreement.
      </p>

      <Section title="1. About Babson Radio">
        <p>Babson Radio is a free, student-run internet radio station. It is run by students and volunteers, not by professional broadcasters. It is not an official publication or statement of Babson College. Shows, hosts and listeners express their own views, and Babson College does not review or endorse them.</p>
        <p>Babson College&apos;s <a className={a} href={LINKS.babsonPrivacy} target="_blank" rel="noopener noreferrer">privacy policy</a> and its student conduct rules also apply to Babson students using Babson Radio.</p>
      </Section>

      <Section title="2. Who can use it">
        <p>Babson Radio is meant for people in the United States. You must be at least 13 years old, and if you are under 18 you need a parent or guardian&apos;s permission. Student accounts are for people with a Babson, Olin or Wellesley email address. Guests can listen live for a limited time, and a student can extend that.</p>
        <p>Do not use Babson Radio where doing so would be unlawful, or if you have been removed from it.</p>
      </Section>

      <Section title="3. Your account">
        <p>Give accurate information and keep it current. Keep your password to yourself and do not share your account. You are responsible for everything that happens under your account. Tell us right away if you think someone else is using it.</p>
      </Section>

      <Section title="4. What you may do with the service">
        <p>We give you a limited, revocable, non-exclusive, non-transferable permission to use Babson Radio for your own personal, non-commercial listening. We can end that permission at any time. We and our licensors own the service, its software, design and content, apart from what you submit. These terms do not give you ownership of anything.</p>
        <p>You may not:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>record, copy, rebroadcast, resell, or otherwise redistribute the stream or any music in it;</li>
          <li>scrape, copy or reverse engineer the website, app, stream, schedule or data, or get around any protection or limit;</li>
          <li>use anything from Babson Radio to train or improve artificial intelligence or machine learning systems;</li>
          <li>frame or mirror Babson Radio, or use it for any commercial purpose, without our written permission;</li>
          <li>use someone else&apos;s account, or let someone use yours;</li>
          <li>interfere with, overload, probe, or try to break into the service or anyone&apos;s data.</li>
        </ul>
      </Section>

      <Section title="5. Radio content">
        <p>Our programming comes from many people and may include music, talk, and live callers or guests. It can contain mature language or subject matter, and we do not screen all of it in advance. Listen at your own discretion. If you are a parent, you are responsible for what your child listens to. Song information, schedules and show details can be wrong or change without notice.</p>
      </Section>

      <Section title="6. Be decent">
        <p>Do not harass, threaten or impersonate anyone, post anything unlawful, hateful or sexually explicit, or share someone else&apos;s private information. Do not use contact syncing for anything except finding friends who already use Babson Radio. Do not send spam or use the service to gather other people&apos;s information.</p>
      </Section>

      <Section title="7. Hosts and what you submit">
        <p>If you host a show, you are responsible for what you broadcast. You must follow station rules, Babson&apos;s policies, and the music licensing rules the station is subject to, and you must have the rights to anything you play, say or upload. You may be asked to leave the air at any time.</p>
        <p>Anything you submit to Babson Radio, such as set lists, show details, pictures, profile information, bug reports, requests and ideas, remains yours, but you give Babson Sound and the station a free, worldwide, permanent, irrevocable and sublicensable permission to use, copy, edit, broadcast, publish and display it, and to use your name, voice and likeness as part of the station and its promotion. You waive any claim that this use violates your moral rights or requires payment. We may use any ideas or feedback you give us without credit or payment. We can review, edit or remove anything you submit.</p>
      </Section>

      <Section title="8. Copyright complaints">
        <p>We respect copyright and respond to notices that follow the Digital Millennium Copyright Act. To report infringing material, send us: your signature (typed is fine); the work you say is infringed; where the material appears on Babson Radio; your contact information; a statement that you believe in good faith the use is not authorized; and a statement, under penalty of perjury, that the notice is accurate and that you are the owner or authorized to act for the owner. Send it to {email ?? 'the contact in section 21'}.</p>
        <p>If you think material was removed by mistake, you may send a counter-notice with the same kind of details. Knowingly false notices can carry legal liability. We may remove material and end the accounts of people who repeatedly infringe.</p>
      </Section>

      <Section title="9. Other companies">
        <p>Babson Radio depends on and links to services run by others, such as sign-in and database providers, hosting, YouTube video, and Apple&apos;s App Store. Their terms apply to your use of them, and we are not responsible for them, their content, or their availability.</p>
      </Section>

      <Section title="10. Beta and test features">
        <p>Some features, or the whole service during testing, may be unfinished or unstable. Use of test features is at your own risk, and we may change or remove them, or reset test data, at any time.</p>
      </Section>

      <Section title="11. Messages from us">
        <p>By creating an account you agree that we may email you or send notifications about your account, the service and security. You can control show reminders and notification settings in the app. We do not send marketing text messages. If that ever changes, we will ask first.</p>
      </Section>

      <Section title="12. Changes to the service">
        <p>We can change, pause or stop any part of Babson Radio, or any feature, at any time, with or without notice. The station goes off the air for maintenance, technical problems, or other reasons. We do not promise that any show, song, feature or schedule will continue.</p>
      </Section>

      <Section title="13. Ending access">
        <p>You can stop using Babson Radio and delete your account from your profile at any time. We can suspend or end your access, or remove content, at any time and for any reason, including breaking these terms or putting the station or other people at risk, and we do not owe you anything for doing so. Sections that by their nature should continue, including those on content, misuse, disclaimers, liability, release and disputes, continue after your account ends.</p>
      </Section>

      <Section title="14. Disclaimers">
        <Loud>Babson Radio is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; and your use is at your own risk. To the fullest extent the law allows, Babson Sound, its officers, members, hosts and volunteers, Babson College, and their affiliates (together, the &ldquo;Babson Radio parties&rdquo;) make no promises or warranties of any kind, express or implied, including about quality, accuracy, reliability, availability, merchantability, fitness for a particular purpose, and non-infringement.</Loud>
        <Loud>We do not promise that the stream, website or app will be uninterrupted, timely, secure or error free, that content or schedules are accurate, that any data will be kept, or that the service is free of viruses or harmful components. The service is not a way to reach emergency services and must not be relied on for emergency, safety or time-critical information.</Loud>
        <p>Some places do not allow certain disclaimers, so some of this may not apply to you.</p>
      </Section>

      <Section title="15. Limits on liability">
        <Loud>To the fullest extent the law allows, the Babson Radio parties are not liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, lost data, lost opportunities, or harm to your device, arising from or related to Babson Radio or these terms, under any legal theory, even if we were told it could happen. This includes anything a host, listener, guest or other person says, plays or does, any interruption or loss of the service, and any unauthorized access to your information.</Loud>
        <Loud>To the fullest extent the law allows, the total liability of the Babson Radio parties for all claims related to Babson Radio or these terms is limited to one hundred U.S. dollars ($100).</Loud>
        <p>Babson Radio is free, and these limits are part of why we can offer it. Some places do not allow some of these limits, and in those places our liability is limited as much as the law permits.</p>
      </Section>

      <Section title="16. Release and your responsibility">
        <p>You release the Babson Radio parties from claims, demands and damages of any kind, known or unknown, that come from your use of Babson Radio or from the acts of other users, hosts or third parties, to the extent the law allows.</p>
        <p>You agree to defend, indemnify and hold harmless the Babson Radio parties from any claim, loss, liability or expense (including reasonable attorneys&apos; fees) that comes from your content, your use of Babson Radio, your breach of these terms, or your violation of any law or anyone&apos;s rights. We may take over the defense of any such matter, and you will help us.</p>
      </Section>

      <Section title="17. Misuse and enforcement">
        <p>We can warn you, remove content, and suspend or end your account at any time if we think you have misused Babson Radio or broken these terms.</p>
        <p><strong className="text-br-dk-text">Students.</strong> If you are a Babson, Olin or Wellesley student, we handle misuse through your college&apos;s student conduct and disciplinary process. By using Babson Radio you agree that we may report misuse to your college and share your name, email, account details and records about the misuse with the college for that purpose. The college decides what, if anything, happens next. We do not control that process or its outcome.</p>
        <p><strong className="text-br-dk-text">Everyone else.</strong> If you are not a student of one of these colleges, we may take legal action against you, report you to law enforcement, and ask a court for money damages and for orders to stop the misuse. You agree to pay our reasonable costs of enforcing these terms against you, including attorneys&apos; fees, if we win.</p>
        <p>Nothing here limits our right to act at the same time under both paths, to contact the authorities when the law or safety requires it, or to go to court to stop misuse of our service or content.</p>
      </Section>

      <Section title="18. Resolving disputes (arbitration)">
        <Loud>Please read this section carefully. It affects your legal rights, including your right to go to court and to have a jury.</Loud>
        <p><strong className="text-br-dk-text">Talk to us first.</strong> If you have a dispute with the Babson Radio parties, send a written description of it, with your contact details, to {email ?? 'the contact in section 21'}, and give us 45 days to work it out before you start anything formal.</p>
        <p><strong className="text-br-dk-text">Binding arbitration.</strong> If we cannot resolve it, you and Babson Sound agree to resolve any dispute or claim related to Babson Radio or these terms only through final and binding arbitration before the American Arbitration Association (AAA) under its consumer arbitration rules, and not in court. The arbitration is in Massachusetts, or by phone or video if you prefer. The arbitrator applies these terms and the law, and a court may enter judgment on the award. The Federal Arbitration Act governs this section.</p>
        <p><strong className="text-br-dk-text">What stays out of arbitration.</strong> Either side may bring a claim in small claims court if it qualifies. Babson Sound may go to court to stop misuse or protect its service, content or intellectual property. Student misuse handled by a college under section 17 is not an arbitration matter. A dispute that cannot be arbitrated by law goes to the state or federal courts in Massachusetts.</p>
        <p><strong className="text-br-dk-text">Individual claims only, no jury.</strong> To the extent the law allows, claims may be brought only for yourself or for Babson Sound, and not in any class, collective or representative action. If this waiver cannot be enforced as to a claim, that claim goes to court, not arbitration. Both sides also waive any right to a jury trial.</p>
        <p><strong className="text-br-dk-text">Time limit.</strong> Any claim must be started within one year after it arose, or it is barred.</p>
        <p><strong className="text-br-dk-text">You can opt out.</strong> You can opt out of arbitration within 30 days of first agreeing to these terms by sending the contact in section 21 a message that says so, with your name and account email. Opting out does not affect anything else in these terms.</p>
        <p><strong className="text-br-dk-text">Law.</strong> These terms are governed by the laws of the Commonwealth of Massachusetts, without regard to its conflict-of-law rules.</p>
      </Section>

      <Section title="19. The rest">
        <p>These terms and the Privacy Policy are the whole agreement between you and us about Babson Radio. If part of them cannot be enforced, the rest still applies. If we do not enforce something, that does not mean we give it up. You cannot transfer your rights under these terms. We can transfer ours. Nobody other than the Babson Radio parties and you has rights under these terms.</p>
      </Section>

      <Section title="20. Changes to these terms">
        <p>We may update these terms. We will change the date above, and for important changes we will tell you in the app, on the website, or by email at least 30 days before they take effect, except changes needed to comply with law or add new features, which can take effect right away. If you keep using Babson Radio after a change takes effect, you accept it. If you do not agree, stop using it and delete your account.</p>
      </Section>

      <Section title="21. Contact">
        <p>
          Send a bug report or idea from your profile, or reach us on{' '}
          {INSTAGRAM_URL ? <a className={a} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a> : 'Instagram'}
          {email ? <>, or email {email}</> : ''}.
        </p>
      </Section>
    </div>
  )
}
