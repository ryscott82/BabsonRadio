import { adminDb } from '@/lib/server/admin'
import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { mailConfigured, sendMail, studioInviteMail } from '@/lib/server/mailer'
import { SITE_URL } from '@/lib/links'

export const runtime = 'nodejs'

// Emails people who are marked Studio trained but have not signed up yet (saved roles with Studio trained, no account).
//   POST { emails?: string[] }   those emails, or every such person when left out.  -> { sent, skipped, failed }
// The email links to /studioaccess. Nobody gets more than one in 3 days, so a double click or a repeat does not spam them.
const GAP = 3 * 86_400_000

export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    if (!mailConfigured()) throw new HttpError(503, 'Email is not set up yet. Add RESEND_API_KEY in Vercel.', 'BR-MAIL-001')
    const b = await readJson(req)
    const want = Array.isArray(b.emails) ? new Set((b.emails as unknown[]).map(e => String(e).toLowerCase())) : null
    const snap = await adminDb().collection('roleInvites').where('studioTrained', '==', true).get()
    const m = studioInviteMail({ link: `${SITE_URL}/studioaccess` })
    const now = Date.now()
    let sent = 0, skipped = 0, failed = 0
    for (const d of snap.docs) {
      const email = String(d.get('email') ?? '')
      if (!email || (want && !want.has(email))) continue
      if (now - ((d.get('mailedAt') as number | undefined) ?? 0) < GAP) { skipped++; continue }
      if (await sendMail(email, m.subject, m.text, m.html, { bulk: true })) { await d.ref.update({ mailedAt: now }); sent++ } else failed++
    }
    return { ok: true, sent, skipped, failed }
  }, { 'Cache-Control': 'no-store' })
}
