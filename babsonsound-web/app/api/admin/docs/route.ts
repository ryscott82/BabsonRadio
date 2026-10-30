import { HttpError, handle, requireAdmin } from '@/lib/server/http'
import { docList, docText } from '@/lib/server/docs'

export const runtime = 'nodejs'

// Admin only. No id: the list of guides. With ?id=: that guide's text.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return { docs: docList().map(({ id, group, title, about, source }) => ({ id, group, title, about, file: source.split('/').pop() })) }
    const d = docText(id)
    if (!d) throw new HttpError(404, 'That guide was not found.')
    return { id: d.doc.id, title: d.doc.title, text: d.text }
  })
}
