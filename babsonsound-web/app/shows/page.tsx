import { redirect } from 'next/navigation'

// The Shows list is now a section of the Library. /shows/<name> pages are unchanged. (next.config.ts redirects this address too.)
export default function ShowsPage() { redirect('/library#shows') }
