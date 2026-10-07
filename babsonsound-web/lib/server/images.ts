import 'server-only'
import { randomUUID } from 'node:crypto'
import { adminBucket } from './admin'

// Schedule images live in Firebase Storage under schedule/<uid>/<random>.jpg. The browser/app shrinks
// each picture (about 800px wide, ~100 KB) before upload; the server enforces a hard 1 MB cap.

export const MAX_IMAGE_BYTES = 1_000_000
export const IMAGE_URL_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/'

function kind(b: Buffer): 'jpg' | 'webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

export async function saveImage(uid: string, data: Buffer): Promise<{ url: string; path: string }> {
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) throw new Error('size')
  const ext = kind(data)
  if (!ext) throw new Error('type')
  const bucket = adminBucket()
  const path = `schedule/${uid}/${randomUUID()}.${ext}`
  const token = randomUUID()
  await bucket.file(path).save(data, {
    contentType: ext === 'jpg' ? 'image/jpeg' : 'image/webp',
    metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: `${IMAGE_URL_PREFIX}${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`, path }
}

/** Best-effort delete; only ever touches schedule/ files. */
export async function deleteImage(path: unknown) {
  if (typeof path !== 'string' || !path.startsWith('schedule/') || path.includes('..')) return
  await adminBucket().file(path).delete({ ignoreNotFound: true }).catch(() => {})
}

/** Validates an {imageUrl, imagePath} pair coming from a client: path must be the caller's own folder. */
export function checkImageRef(uid: string | null, url: unknown, path: unknown): { imageUrl: string; imagePath: string } | null {
  if (typeof url !== 'string' || typeof path !== 'string' || !url || !path) return null
  if (!url.startsWith(IMAGE_URL_PREFIX) || url.length > 600 || !path.startsWith('schedule/') || path.includes('..')) return null
  if (uid && !path.startsWith(`schedule/${uid}/`)) return null
  return { imageUrl: url, imagePath: path }
}
