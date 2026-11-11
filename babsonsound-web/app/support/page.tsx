import type { Metadata } from 'next'
import Link from 'next/link'
import { supportEmail } from '@/lib/contactEmail'
import { INSTAGRAM_URL } from '@/lib/links'

export const metadata: Metadata = {
  title: 'Support | Babson Radio',
  description: 'Get help with Babson Radio: signing in, passwords, deleting your account, reporting a problem, notifications and contacts.',
}

// Public on purpose: nobody has to sign in to read it (App Review, people locked out of their account, people who have not signed up).
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "I can't sign in",
    a: (
      <>
        <p>Check that you are using the email you signed up with and that the password is right (passwords are case sensitive). If it still fails, use <strong className="text-br-dk-text">Forgot password</strong> on the sign-in screen.</p>
        <p>New accounts need a confirmed email. We send a link when you sign up; look in spam or junk if it is not in your inbox, and ask for a new one from the sign-in screen. An account that stays unconfirmed past its grace period can only reach the confirmation screen.</p>
        <p>Still stuck? Email us the error code you see (it looks like BR-AUTH-001, and every one is listed on the <Link href="/support/errors" className="text-br-gold underline underline-offset-4">error codes page</Link>).</p>
      </>
    ),
  },
  {
    q: 'How do I reset my password?',
    a: (
      <>
        <p>On the sign-in screen choose <strong className="text-br-dk-text">Forgot password</strong>, enter your email and open the link we send. It comes from Babson Radio and may land in spam or junk. The link works for a limited time; ask for a new one if it has expired.</p>
        <p>If you are signed in and just want a new password, sign out and use the same steps.</p>
      </>
    ),
  },
  {
    q: 'How do I delete my account?',
    a: (
      <>
        <p>In the app: <strong className="text-br-dk-text">Profile, Help, Delete account</strong>. On the website: <Link href="/delete-account" className="text-br-gold underline underline-offset-4">babsonradio.com/delete-account</Link>. Both ask for your password, then remove your account and the information tied to it.</p>
        <p>Some records, such as logs and backups, may be kept for a while as described in the <Link href="/privacy" className="text-br-gold underline underline-offset-4">Privacy Policy</Link>. If you cannot sign in, email us from the address on the account and we will help.</p>
      </>
    ),
  },
  {
    q: 'How do I report a problem, a person or something I saw?',
    a: (
      <>
        <p>In the app, tap <strong className="text-br-dk-text">Report</strong> next to what you want to flag, or go to <strong className="text-br-dk-text">Profile, Help</strong> to send a bug report or an idea. On the website, use the bug and idea form on your profile page. Staff read every report.</p>
        <p>You can also email us (address below) with what you saw, where, and when. In an emergency or if someone is in danger, contact campus safety or local emergency services first.</p>
      </>
    ),
  },
  {
    q: 'How do notifications work?',
    a: (
      <>
        <p>Notifications are optional. Turn on the kinds you want (for example, a show going live or a reminder for a show) under <strong className="text-br-dk-text">Profile, Notifications</strong>. The first time, your phone asks for permission.</p>
        <p>To stop them, turn them off in the app or in your phone&apos;s Settings, Notifications, Babson Radio. Which notifications exist may change as the app grows.</p>
      </>
    ),
  },
  {
    q: 'What happens with my contacts?',
    a: (
      <>
        <p>Sharing contacts is optional and off until you turn it on (<strong className="text-br-dk-text">Profile, Invite friends</strong>). The app explains what is used before your phone asks. You can turn access off any time in your phone&apos;s Settings, and nothing is sent to anyone unless you tap a person and choose to send an invite.</p>
        <p>What we may collect and how it may be used is in the <Link href="/privacy" className="text-br-gold underline underline-offset-4">Privacy Policy</Link>. To have contact information removed, delete your account or email us.</p>
      </>
    ),
  },
  {
    q: 'Do I need an account to listen?',
    a: (
      <p>No. You can choose <strong className="text-br-dk-text">Just listen for now</strong> to hear the live station. Some features, such as the schedule, reminders and your profile, need an account, and some features are for Babson, Olin and Wellesley students. What you can do may change over time.</p>
    ),
  },
]

export default function SupportPage() {
  const a = 'text-br-gold underline underline-offset-4'
  const email = supportEmail()
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
      <div>
        <h1 className="font-display text-br-dk-text text-4xl tracking-[0.08em]">Support</h1>
        <p className="text-sm text-br-dk-sub mt-3 leading-relaxed">
          Babson Radio is a student-run internet radio station run by Babson Sound, a student organization at Babson College.
          We stream live shows and music around the clock on this website and in our iPhone app, with schedules, reminders and more.
          You do not need to sign in to read this page.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-br-dk-text text-xl tracking-wide">Contact us</h2>
        <div className="text-sm text-br-dk-sub space-y-2 leading-relaxed">
          <p>Email <a className={a} href={`mailto:${email}`}>{email}</a>. Tell us what happened, which device you use (website, iPhone) and any error code you saw. Students run the station, so please allow a few days for a reply.</p>
          {INSTAGRAM_URL && <p>You can also message us on <a className={a} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a>.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-br-dk-text text-xl tracking-wide">Common questions</h2>
        <div className="space-y-2">
          {FAQ.map(f => (
            <details key={f.q} className="sk-raised rounded-xl px-4 py-3 group">
              <summary className="cursor-pointer text-br-dk-text text-sm font-medium list-none flex items-center justify-between gap-4">
                {f.q}
                <span aria-hidden="true" className="text-br-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="text-sm text-br-dk-sub space-y-2 leading-relaxed mt-3">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-br-dk-text text-xl tracking-wide">More</h2>
        <ul className="text-sm space-y-1">
          <li><Link href="/privacy" className={a}>Privacy Policy</Link></li>
          <li><Link href="/terms" className={a}>Terms of Use</Link></li>
          <li><Link href="/support/errors" className={a}>Error codes</Link></li>
          <li><Link href="/about" className={a}>About Babson Radio</Link></li>
        </ul>
      </section>
    </div>
  )
}
