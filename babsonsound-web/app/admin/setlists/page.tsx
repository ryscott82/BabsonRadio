import { redirect } from 'next/navigation'

// Set lists live inside each show's entry on the schedule page now. Old links to /admin/setlists land there.
export default function OldSetlistsPage() { redirect('/admin/schedule') }
