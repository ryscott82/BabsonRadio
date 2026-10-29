// A picture reference the browser or app sends back to us: { imageUrl, imagePath }. It is only accepted when the URL is exactly the
// one saveImage() makes for that path in OUR bucket, so nobody can point a schedule picture at another bucket or someone else's file.
export const IMAGE_URL_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/'
const PATH = /^schedule\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(jpg|webp)$/
const TOKEN = /^[0-9a-f-]{36}$/

export function imageRefOk(url: unknown, path: unknown, bucket: string | undefined, uid: string | null): boolean {
  if (typeof url !== 'string' || typeof path !== 'string' || !bucket || url.length > 600) return false
  if (!PATH.test(path)) return false
  if (uid && !path.startsWith(`schedule/${uid}/`)) return false
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (`${u.origin}/` !== IMAGE_URL_PREFIX.replace(/v0\/b\/$/, '') || u.username || u.password || u.hash) return false
  // The encoded path must match exactly: /v0/b/<our bucket>/o/<the path, slashes as %2F>
  if (u.pathname !== `/v0/b/${bucket}/o/${encodeURIComponent(path)}`) return false
  const keys = [...u.searchParams.keys()].sort().join(',')
  return keys === 'alt,token' && u.searchParams.get('alt') === 'media' && TOKEN.test(u.searchParams.get('token') ?? '')
}
