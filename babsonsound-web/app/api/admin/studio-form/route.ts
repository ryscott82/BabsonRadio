import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { saveStudioFormUrl, studioFormInfo } from '@/lib/server/studioForm'

export const runtime = 'nodejs'

// The Studio training form address shown on /studioaccess. Admins only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return studioFormInfo() })
}

// { url }  saves a new address (a Microsoft Forms link);  { url: '' }  clears it (the STUDIO_FORM_URL setting in Vercel is used if there is one).
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    if (typeof b.url !== 'string') throw new HttpError(400, 'Send a url.')
    try { await saveStudioFormUrl(b.url, t.uid) } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Could not save.', 'BR-STU-104') }
    return studioFormInfo()
  })
}
