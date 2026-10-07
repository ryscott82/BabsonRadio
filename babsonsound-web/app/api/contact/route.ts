import { handle, requireUser } from '@/lib/server/http'

export const runtime = 'nodejs'

// The station's contact address is only given to signed-in people, so it isn't sitting in public pages for scrapers.
// Override with the CONTACT_EMAIL environment variable in Vercel.
const CONTACT = process.env.CONTACT_EMAIL ?? 'williamatdavies@gmail.com'

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req)
    return { email: CONTACT }
  })
}
