import { HttpError, handle, requireMember, requireStaff } from '@/lib/server/http'
import { MAX_IMAGE_BYTES, saveImage } from '@/lib/server/images'

export const runtime = 'nodejs'

// Upload one (already shrunk) picture for a schedule item.
// multipart/form-data: file = the image, scope = "slot" (students) or "show" (staff).
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const scope = form?.get('scope')
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a picture to upload.')
    const t = scope === 'show' ? await requireStaff(req) : await requireMember(req)
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, 'That picture is too big. Pick a smaller one.')
    try {
      return await saveImage(t.uid, Buffer.from(await file.arrayBuffer()))
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      if (m === 'type') throw new HttpError(400, 'Use a JPEG or WebP picture.')
      if (m === 'size') throw new HttpError(413, 'That picture is too big. Pick a smaller one.')
      throw e
    }
  })
}
