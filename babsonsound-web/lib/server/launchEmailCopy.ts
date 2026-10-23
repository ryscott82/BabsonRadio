// The launch email: edit the words here. Nothing else needs to change.
// Short and plain. {{UNSUB}} becomes each person's own unsubscribe link when it is sent. No yellow in the HTML.
import 'server-only'

export const LAUNCH_EMAIL_SUBJECT = 'Babson Radio launches tomorrow, Oct 30 at 10:00 AM ET'

export const LAUNCH_EMAIL_BUTTON = 'Open Babson Radio'
export const LAUNCH_EMAIL_URL = 'https://babsonradio.com'

export const LAUNCH_EMAIL_TEXT = `Babson Radio launches tomorrow, Oct 30 at 10:00 AM ET.

You already have an account, so you're in. Come listen when we go live.

${LAUNCH_EMAIL_URL}

Babson Radio

You're getting this because you signed up at babsonradio.com.
Unsubscribe: {{UNSUB}}
`

export const LAUNCH_EMAIL_HTML = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p>Babson Radio launches <strong>tomorrow, Oct 30 at 10:00 AM ET</strong>.</p>
<p>You already have an account, so you're in. Come listen when we go live.</p>
<p style="margin:28px 0"><a href="${LAUNCH_EMAIL_URL}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">${LAUNCH_EMAIL_BUTTON}</a></p>
<p>Babson Radio</p>
<p style="font-size:12px;color:#6b665c;margin-top:32px">You're getting this because you signed up at babsonradio.com. <a href="{{UNSUB}}" style="color:#6b665c">Unsubscribe</a></p>
</div>`
