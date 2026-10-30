import { handle, requireUser } from '@/lib/server/http'

export const runtime = 'nodejs'

// The pre-launch lock is gone, so nobody needs a launch pass. This stays only so app versions that still ask for one keep working.
export async function POST(req: Request) {
  return handle(async () => { await requireUser(req); return { open: true, gate: null } }, { 'Cache-Control': 'no-store' })
}

// Older web sessions may still hold a pass cookie: drop it.
export async function DELETE() {
  const res = await handle(async () => ({ ok: true }), { 'Cache-Control': 'no-store' })
  res.headers.append('Set-Cookie', 'br_pass=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
  return res
}
