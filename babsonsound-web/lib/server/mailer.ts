import 'server-only'

// Email from babsonradio.com through Resend (https://resend.com). Set in Vercel:
//   RESEND_API_KEY   the key from your Resend dashboard
//   MAIL_FROM        optional, default "Babson Radio <hello@babsonradio.com>" (the domain must be verified in Resend)
//   MAIL_REPLY_TO    optional, where replies go
export const mailConfigured = () => !!process.env.RESEND_API_KEY

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!mailConfigured()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Babson Radio <hello@babsonradio.com>',
        to: [to], subject, text, html,
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
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

/** "You've been selected to beta test Babson Radio." */
export function betaWelcome(email: string) {
  const subject = 'You’ve been selected to beta test Babson Radio'
  const link = 'https://babsonradio.com/auth'
  const text = [
    'Hi,',
    '',
    'You’ve been selected to beta test Babson Radio, the student-run radio station at Babson.',
    '',
    `To get in, create your account at ${link} using this email address (${email}). It has to be the same address, since that’s how we recognize you.`,
    '',
    'Once you’re in, listen live, look around, and tell us what breaks or what feels off. There’s a Report bug / feature button at the bottom of every page.',
    '',
    'Thanks for helping us get this ready.',
    '',
    'Babson Radio',
  ].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p>Hi,</p>
<p>You’ve been selected to beta test <strong>Babson Radio</strong>, the student-run radio station at Babson.</p>
<p>To get in, <a href="${link}" style="color:#006644">create your account</a> using this email address (<strong>${esc(email)}</strong>). It has to be the same address, since that’s how we recognize you.</p>
<p>Once you’re in, listen live, look around, and tell us what breaks or what feels off. There’s a Report bug / feature button at the bottom of every page.</p>
<p>Thanks for helping us get this ready.</p>
<p>Babson Radio</p></div>`
  return { subject, text, html }
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
    ['Hi,', ...lines, 'Babson Radio'].map(l => (l === '' ? '' : `<p style="white-space:pre-wrap">${esc(l)}</p>`)).join('')}</div>`
  return { subject, text, html }
}

/** A student invites a friend by email: "[First name] wants you to join them on Babson Radio!" */
export function friendInviteMail(o: { firstName: string; email: string }) {
  const subject = `${o.firstName} wants you to join them on Babson Radio!`
  const link = 'https://babsonradio.com/auth'
  const line = `${o.firstName} wants you to join them on Babson Radio! Sign up at babsonradio.com with this email to get access!`
  const text = [line, '', link, '', 'Babson Radio'].join('\n')
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p><strong>${esc(o.firstName)}</strong> wants you to join them on Babson Radio!</p>
<p>Sign up at <a href="${link}" style="color:#006644">babsonradio.com</a> with this email (<strong>${esc(o.email)}</strong>) to get access!</p>
<p>Babson Radio</p></div>`
  return { subject, text, html }
}
