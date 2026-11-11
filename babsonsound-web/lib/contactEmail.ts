// The station's contact address. One place, so the Terms, the footer and /support always agree.
// Set SUPPORT_EMAIL (or the older CONTACT_EMAIL) in Vercel. It must be a mailbox somebody reads: App Review and users write to it.
// The fallback is the address the site already sends its email from (lib/server/mailer.ts); make sure that mailbox receives mail.
export const DEFAULT_SUPPORT_EMAIL = 'hello@babsonradio.com'

export const supportEmail = (env: Record<string, string | undefined> = process.env) =>
  (env.SUPPORT_EMAIL || env.CONTACT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim()
