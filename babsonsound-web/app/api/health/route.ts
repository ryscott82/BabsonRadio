import { adminAuth, adminDb } from '@/lib/server/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Setup checker: open /api/health to see which server pieces work. Reveals only yes/no and an error
// code, never a secret. Safe to leave on; delete the folder if you'd rather not expose it.
export async function GET() {
  const out: Record<string, unknown> = {}

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  out.serviceAccountSet = !!raw
  try { if (raw) { const j = JSON.parse(raw); out.serviceAccountParses = true; out.serviceAccountProject = j.project_id } }
  catch { out.serviceAccountParses = false }

  out.pepperSet = (process.env.PHONE_HASH_PEPPER ?? '').length >= 16

  const code = (e: unknown) => String((e as { code?: unknown }).code ?? (e instanceof Error ? e.message.slice(0, 80) : 'error'))
  try { await adminDb().collection('phoneIndex').limit(1).get(); out.firestore = 'ok' }
  catch (e) { out.firestore = `FAILED: ${code(e)}` }
  try { await adminAuth().listUsers(1); out.auth = 'ok' }
  catch (e) { out.auth = `FAILED: ${code(e)}` }

  return Response.json(out)
}
