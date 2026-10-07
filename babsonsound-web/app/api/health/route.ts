import { adminAuth, adminDb } from '@/lib/server/admin'
import { classifyServerError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Setup checker: open /api/health to see which server pieces work. Reveals only yes/no and an error
// code, never a secret. Safe to leave on; delete the folder if you'd rather not expose it.
export async function GET() {
  try { return await check() }
  catch (e) {
    console.error('[health] crashed', e)
    return Response.json({ crashed: true, message: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 200 })
  }
}

async function check() {
  const out: Record<string, unknown> = {}
  const problems: string[] = []

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  out.serviceAccountSet = !!raw
  try { if (raw) { const j = JSON.parse(raw); out.serviceAccountParses = true; out.serviceAccountProject = j.project_id } }
  catch { out.serviceAccountParses = false }

  out.pepperSet = (process.env.PHONE_HASH_PEPPER ?? '').length >= 16

  const code = (e: unknown) => String((e as { code?: unknown }).code ?? (e instanceof Error ? e.message.slice(0, 80) : 'error'))
  let firestoreErr: unknown, authErr: unknown
  try { await adminDb().collection('phoneIndex').limit(1).get(); out.firestore = 'ok' }
  catch (e) { firestoreErr = e; out.firestore = `FAILED: ${code(e)}` }
  try { await adminAuth().listUsers(1); out.auth = 'ok' }
  catch (e) { authErr = e; out.auth = `FAILED: ${code(e)}` }

  if (!raw) problems.push('BR-SRV-001')
  else if (out.serviceAccountParses === false) problems.push('BR-SRV-002')
  if (!out.pepperSet) problems.push('BR-SRV-003')
  if (firestoreErr) problems.push(classifyServerError(firestoreErr))
  if (authErr) problems.push(classifyServerError(authErr))
  out.problems = [...new Set(problems)]
  out.keyPage = '/support/errors'
  return Response.json(out)
}
