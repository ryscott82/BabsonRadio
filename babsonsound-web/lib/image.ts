import { auth } from '@/lib/firebase'

// Pictures are shrunk in the browser before upload: max 800px, JPEG, usually 60–150 KB.
const MAX_SIDE = 800
const TARGET_BYTES = 400_000

export async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture file.')
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) throw new Error('That picture could not be read. Try a JPEG or PNG.')
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that picture.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', q))
    if (blob && blob.size <= TARGET_BYTES) return blob
  }
  throw new Error('That picture is too detailed. Try another one.')
}

export interface UploadedImage { url: string; path: string }

export async function uploadImage(file: File, scope: 'slot' | 'show'): Promise<UploadedImage> {
  const blob = await shrinkImage(file)
  const form = new FormData()
  form.append('file', blob, 'image.jpg')
  form.append('scope', scope)
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch('/api/images', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
    .catch(() => { throw new Error("Can't reach Babson Radio. Check your connection. (BR-CLI-001)") })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${data?.error ?? 'Upload failed.'}${data?.code ? ` (${data.code})` : ''}`)
  return data as UploadedImage
}
