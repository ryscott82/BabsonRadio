import { handle } from '@/lib/server/http'
import { mintWorkerToken, verifySigned } from '@/lib/server/worker'

export const runtime = 'nodejs'

// The studio PC signs in here instead of holding a service-account key. It sends a fresh nonce and its signature
// (headers x-worker-nonce "<ms>.<random>" and x-worker-sig = hex HMAC-SHA256 of "worker:<nonce>" with WORKER_SECRET; the clock must be within 2 minutes).
// Reply: { token, expiresAt }: a Firebase custom token (uid studio-worker, claim worker: true) for signInWithCustomToken. Valid for 1 hour.
export async function POST(req: Request) {
  return handle(async () => {
    verifySigned(req)
    return mintWorkerToken()
  })
}
