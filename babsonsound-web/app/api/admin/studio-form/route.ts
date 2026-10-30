import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { saveStudioForm, studioFormInfo } from '@/lib/server/studioForm'

export const runtime = 'nodejs'

// The Studio training form address shown on /studioaccess. Admins only.
export async function GET(req: Request) {
  return handle(async () => { await requireAdmin(req); return studioFormInfo() })
}

// { url?, embed? }  saves a new address (a Microsoft Forms link; '' clears it, and STUDIO_FORM_URL in Vercel is used if there is one) and/or
// turns "show the form inside the page" on or off.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    if (typeof b.url !== 'string' && typeof b.embed !== 'boolean') throw new HttpError(400, 'Nothing to save.')
    try {
      await saveStudioForm({ url: typeof b.url === 'string' ? b.url : undefined, embed: typeof b.embed === 'boolean' ? b.embed : undefined }, t.uid)
    } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Could not save.', 'BR-STU-104') }
    return studioFormInfo()
  })
}
