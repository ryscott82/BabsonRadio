import { redirect } from 'next/navigation'

// The station controls now live on the admin dashboard.
export default function ControlsRedirect() {
  redirect('/admin')
}
