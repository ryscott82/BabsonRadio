import { handle, requireUser } from '@/lib/server/http'
import { supportEmail } from '@/lib/contactEmail'

export const runtime = 'nodejs'

// The footer and Terms give the contact address to signed-in people only. The public /support page shows it to everyone
// (App Review and people who cannot sign in need it). Set SUPPORT_EMAIL (or CONTACT_EMAIL) in Vercel; see lib/contactEmail.ts.
const CONTACT = supportEmail()

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req)
    return { email: CONTACT }
  })
}
