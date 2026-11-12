import { redirect } from 'next/navigation'

// The old address. Sending now lives on the Notifications page.
export default function NotifyRedirect() {
  redirect('/admin/notifications')
}
