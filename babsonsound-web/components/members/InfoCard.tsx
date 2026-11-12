import Link from 'next/link'
import { INFO } from '@/lib/membersPage'

/** Rules, clean hours, quiet hours and who to ask. Plain text, everyone can read it. */
export default function InfoCard() {
  return (
    <div className="space-y-4">
      <ul className="list-disc pl-6 space-y-1 text-base text-br-dk-text">{INFO.rules.map(r => <li key={r}>{r}</li>)}</ul>
      <p className="text-base text-br-dk-text">{INFO.cleanHours}</p>
      <p className="text-base text-br-dk-text">{INFO.quietHours}</p>
      <p className="text-base text-br-dk-sub">{INFO.contactNote} <Link href="/support" className="text-br-gold underline underline-offset-4">Support</Link></p>
    </div>
  )
}
