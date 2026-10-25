// Words on the site that an admin can change (Admin Panel > Page text). No server imports here, so pages and the admin screen share it.
//
// To make more text editable: add a line to SITE_TEXT with its default, then show it on the page with
//   const t = await loadSiteText()  (server pages)   and   <Rich text={txt(t, 'page.key')} />  or  {lines(t, 'page.key').map(...)}
// Links inside text are written [words](/page) or [words](https://example.com).
import { LINKS } from '@/lib/links'

export interface SiteTextItem { key: string; page: string; label: string; def: string; lines?: boolean; hint?: string }

export const SITE_TEXT: SiteTextItem[] = [
  { key: 'about.title', page: 'About', label: 'Page title', def: 'About us' },
  { key: 'about.subtitle', page: 'About', label: 'Line under the title', def: 'The student-run radio station of Babson College.' },
  { key: 'about.what.title', page: 'About', label: 'What we do: heading', def: 'What we do' },
  { key: 'about.what.items', page: 'About', label: 'What we do: lines', lines: true, hint: 'One line per bullet. Start a line with ~ for small gray text.',
    def: 'Live shows from campus\nMusic in between\nMade by students and volunteers\n~ Babson College does not review or endorse what we play.' },
  { key: 'about.listen.title', page: 'About', label: 'Listen: heading', def: 'Listen' },
  { key: 'about.listen.items', page: 'About', label: 'Listen: lines', lines: true,
    def: 'On this website or in the iPhone app\nLive radio is free for everyone\nBabson, Olin and Wellesley students sign in with their school email for the rest\nCheck the [schedule](/schedule) and browse the [shows](/shows)' },
  { key: 'about.host.title', page: 'About', label: 'Be on the air: heading', def: 'Be on the air' },
  { key: 'about.host.items', page: 'About', label: 'Be on the air: lines', lines: true,
    def: 'Anyone at Babson can host a show\nWe train you and help with the equipment\nEmail us what you want to make' },
  { key: 'about.sound.title', page: 'About', label: 'Babson Sound: heading', def: 'Babson Sound' },
  { key: 'about.sound.items', page: 'About', label: 'Babson Sound: lines', lines: true,
    def: `The student organization that runs Babson Radio\n[See events and join](${LINKS.about})` },
  { key: 'about.contact.title', page: 'About', label: 'Contact: heading', def: 'Contact', hint: 'The email, Instagram, Terms and Privacy links under it stay as they are.' },
]

export type SiteTextValues = Record<string, string>
export const siteTextItem = (key: string) => SITE_TEXT.find(i => i.key === key)
/** The saved words for a key, or the built-in ones. */
export const txt = (saved: SiteTextValues | undefined, key: string): string => {
  const v = saved?.[key]
  return typeof v === 'string' && v.trim() ? v : (siteTextItem(key)?.def ?? '')
}
export const lines = (saved: SiteTextValues | undefined, key: string): string[] => txt(saved, key).split('\n').map(l => l.trim()).filter(Boolean)
