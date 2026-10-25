import { HttpError, handle, readJson, requireAdmin } from '@/lib/server/http'
import { loadSiteText, saveSiteText } from '@/lib/server/siteText'
import { SITE_TEXT } from '@/lib/siteText'

export const runtime = 'nodejs'

// Every editable text with its built-in words and what is saved now.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    return { items: SITE_TEXT, values: await loadSiteText() }
  })
}

// Save one text ({ key, value }), or send value null to put the built-in words back. Pages pick it up within a minute.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireAdmin(req)
    const b = await readJson(req)
    if (typeof b.key !== 'string' || !(b.value === null || typeof b.value === 'string')) throw new HttpError(400, 'Send a key and a value.')
    try { return { values: await saveSiteText(b.key, b.value as string | null, t.uid) } }
    catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Could not save.') }
  })
}
