// Asks the sign-in pop-up (components/SignInModal.tsx) to open over the current page, so signed-out visitors can sign in without leaving it.
export const openSignIn = (create = false) => window.dispatchEvent(new CustomEvent<boolean>('br:signin-open', { detail: create }))

/** Where the sign-in page goes after sign-in or verification: a path on this site from ?next=, or home. Never another site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/auth')) return '/'
  return next
}
