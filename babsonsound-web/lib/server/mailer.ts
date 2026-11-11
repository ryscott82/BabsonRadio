import 'server-only'
import { listUnsubscribeHeaders } from '../mailHeaders'
import { supportEmail } from '../contactEmail'

// Email from babsonradio.com through Resend (https://resend.com). Set in Vercel:
//   RESEND_API_KEY   the key from your Resend dashboard
//   MAIL_FROM        optional, default "Babson Radio <hello@babsonradio.com>" (the domain must be verified in Resend)
//   MAIL_REPLY_TO    optional, where replies go
export const mailConfigured = () => !!process.env.RESEND_API_KEY

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `bulk: true` is for mail sent to a list of people who did not just ask for it: adds List-Unsubscribe (a mailto to the station address). */
export async function sendMail(to: string, subject: string, text: string, html: string, opts: { bulk?: boolean } = {}): Promise<boolean> {
  if (!mailConfigured()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Babson Radio <hello@babsonradio.com>',
        to: [to], subject, text, html,
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
        ...(opts.bulk ? { headers: listUnsubscribeHeaders({ mailto: supportEmail() }) } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) console.error('[mail]', res.status, (await res.text().catch(() => '')).slice(0, 200))
    return res.ok
  } catch (e) {
    console.error('[mail]', e)
    return false
  }
}

/** Tell a student how their show request went. */
export function slotDecisionMail(o: { approved: boolean; title: string; when: string; note: string; connectionInfo: string }) {
  const subject = o.approved ? `Your show “${o.title}” is approved` : `About your show request “${o.title}”`
  const link = 'https://babsonradio.com/slots'
  const lines = o.approved
    ? [`Good news: your show “${o.title}” is on the schedule for ${o.when}.`,
       ...(o.note ? ['', `A note from the station: ${o.note}`] : []),
       ...(o.connectionInfo ? ['', 'How to go live:', o.connectionInfo] : []),
       '', `You can see everything, or cancel, at ${link}.`]
    : [`Thanks for asking for a spot with “${o.title}” on ${o.when}. We aren’t able to schedule it this time.`,
       ...(o.note ? ['', `A note from the station: ${o.note}`] : []),
       '', `You are welcome to request another time at ${link}.`]
  const text = ['Hi,', '', ...lines, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">${
    ['Hi,', ...lines, 'Babson Radio'].map(l => (l === '' ? '' : `<p style="white-space:pre-wrap">${escapeHtml(l)}</p>`)).join('')}</div>`
  return { subject, text, html }
}

/** A student invites a friend by email: "[First name] wants you to join them on Babson Radio!" */
export function friendInviteMail(o: { firstName: string; email: string }) {
  const subject = `${o.firstName} wants you to join them on Babson Radio!`
  const link = 'https://babsonradio.com/auth'
  const line = `${o.firstName} wants you to join them on Babson Radio! Sign up at babsonradio.com with this email to get access!`
  const text = [line, '', link, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p><strong>${escapeHtml(o.firstName)}</strong> wants you to join them on Babson Radio!</p>
<p>Sign up at <a href="${link}" style="color:#006644">babsonradio.com</a> with this email (<strong>${escapeHtml(o.email)}</strong>) to get access!</p>
<p>Babson Radio</p></div>`
  return { subject, text, html }
}

/** Day-10 reminder: verify the email or the account is deleted on day 14. */
export function verifyReminderMail(o: { deleteAt: number }) {
  const when = new Date(o.deleteAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })
  const subject = 'Verify your email to keep your Babson Radio account'
  const link = 'https://babsonradio.com/auth'
  const lines = [
    'Your Babson Radio email is not verified yet, so your account is locked.',
    `Verify it by ${when} or the account will be deleted.`,
    `Sign in at ${link} and tap Resend email if you need a new link.`,
  ]
  const text = ['Hi,', '', ...lines, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">${
    ['Hi,', ...lines, 'Babson Radio'].map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
  return { subject, text, html }
}

/** Studio training badges are ending: 14 days before, and again on May 1. */
export function trainingExpiryMail(o: { badges: string[]; expiresAt: number; kind: 'd14' | 'may1' }) {
  const what = o.badges.map(b => (b === 'studio' ? 'Studio' : 'Radio')).join(' and ')
  const when = new Date(o.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
  const subject = o.kind === 'd14' ? `Your Babson Radio ${what} training ends soon` : `Renew your Babson Radio ${what} training before June 30`
  const lines = [
    `Your ${what} training runs out on ${when}.`,
    'After that you cannot request new live shows until you renew. Shows already approved stay on the schedule.',
    'To renew, come to a training session. Check babsonradio.com for the next one.',
  ]
  const text = ['Hi,', '', ...lines, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">${
    ['Hi,', ...lines, 'Babson Radio'].map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
  return { subject, text, html }
}

/** Sent after someone opens the Studio training form: a link to set a password for their Babson Radio account. */
export function setPasswordMail(o: { link: string }) {
  const subject = 'Set your Babson Radio password'
  const lines = [
    'You opened the Studio training form at babsonradio.com, so we made you a Babson Radio account.',
    'Set a password to sign in and see your Studio access:',
  ]
  const text = ['Hi,', '', ...lines, '', o.link, '', 'If this was not you, you can ignore this email.', '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p>Hi,</p>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}
<p style="margin:28px 0"><a href="${escapeHtml(o.link)}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">Set password</a></p>
<p>If this was not you, you can ignore this email.</p><p>Babson Radio</p></div>`
  return { subject, text, html }
}

/** Sent by an admin to someone who is Studio trained but has not signed up yet. */
export function studioInviteMail(o: { link: string }) {
  const subject = 'Set up your Babson Radio account'
  const lines = [
    'You are on the Babson Radio Studio trained list, but you have not set up your account yet.',
    'Enter your email on this page to open the Studio form and get a link to set a password:',
  ]
  const text = ['Hi,', '', ...lines, '', o.link, '', 'If this does not look right, you can ignore this email. To stop these emails, reply with "unsubscribe".', '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p>Hi,</p>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}
<p style="margin:28px 0"><a href="${escapeHtml(o.link)}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">Set up my account</a></p>
<p>If this does not look right, you can ignore this email. To stop these emails, reply with &ldquo;unsubscribe&rdquo;.</p><p>Babson Radio</p></div>`
  return { subject, text, html }
}
