import 'server-only'
import { randomUUID } from 'node:crypto'
import { adminBucket } from './admin'
import { IMAGE_URL_PREFIX, imageRefOk } from '../imageRef'

// Schedule images live in Firebase Storage under schedule/<uid>/<random>.jpg. The browser/app shrinks
// each picture (about 800px wide, ~100 KB) before upload; the server enforces a hard 1 MB cap.

export const MAX_IMAGE_BYTES = 1_000_000
export { IMAGE_URL_PREFIX }

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

/**
 * Validates an {imageUrl, imagePath} pair coming from a client: the path must be a schedule/<uid>/<id>.jpg file in the caller's own folder,
 * and the URL must be exactly the download link for that path in OUR bucket (lib/imageRef.ts).
 */
export function checkImageRef(uid: string | null, url: unknown, path: unknown): { imageUrl: string; imagePath: string } | null {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  return imageRefOk(url, path, bucket, uid) ? { imageUrl: url as string, imagePath: path as string } : null
}
