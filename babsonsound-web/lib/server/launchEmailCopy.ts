// The launch email: edit the words here. Nothing else needs to change.
// Lowercase, casual, short. {{UNSUB}} becomes each person's own unsubscribe link when it is sent. No yellow in the HTML.
import 'server-only'

export const LAUNCH_EMAIL_SUBJECT = 'babson radio opens friday, oct 30 at 10am'

export const LAUNCH_EMAIL_BUTTON = 'open babson radio'
export const LAUNCH_EMAIL_URL = 'https://babsonradio.com'

export const LAUNCH_EMAIL_TEXT = `hey,

babson radio opens friday, oct 30 at 10am eastern.

you already made an account, so you're in. come listen, and tell a friend.

${LAUNCH_EMAIL_URL}

babson radio

you're getting this because you signed up at babsonradio.com.
unsubscribe: {{UNSUB}}
`

export const LAUNCH_EMAIL_HTML = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1710;line-height:1.5">
<p>hey,</p>
<p>babson radio opens <strong>friday, oct 30 at 10am eastern</strong>.</p>
<p>you already made an account, so you're in. come listen, and tell a friend.</p>
<p style="margin:28px 0"><a href="${LAUNCH_EMAIL_URL}" style="background:#006644;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">${LAUNCH_EMAIL_BUTTON}</a></p>
<p>babson radio</p>
<p style="font-size:12px;color:#6b665c;margin-top:32px">you're getting this because you signed up at babsonradio.com. <a href="{{UNSUB}}" style="color:#6b665c">unsubscribe</a></p>
</div>`
