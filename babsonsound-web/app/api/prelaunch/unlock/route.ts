import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/server/admin'
import { passwordMatches, prelaunchToken } from '@/lib/prelaunch'
import { classifyServerError } from '@/lib/errors'

export const runtime = 'nodejs'

// One shared account that the developer password signs you in as (a developer, so it behaves like a
// normal signed-in member: live radio, episodes, profile, likes, slot requests, admin).
const PREVIEW_UID = 'preview-developer'

async function ensurePreviewUser() {
  try {
    await adminAuth().getUser(PREVIEW_UID)
  } catch {
    await adminAuth().createUser({ uid: PREVIEW_UID, displayName: 'Preview', emailVerified: true })
  }
  await adminDb().collection('users').doc(PREVIEW_UID).set({
    firstName: 'Preview', displayName: 'Preview', username: 'preview',
    role: 'developer', accountType: 'developer',
    hostOfShows: [], notifyNewEpisode: [], notifyGoesLive: [],
    joinedAt: Timestamp.now(),
  }, { merge: true })
}

// Nothing is stored for the visitor by the server: the browser keeps the proof in a session cookie that
// it deletes the moment the page is refreshed or closed, and the sign-in lives in memory only.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const candidate = typeof body?.password === 'string' ? body.password.slice(0, 200) : ''
  // The email box on the form is a decoy. Real developers leave it blank; anything typed in it fails the unlock.
  const decoy = typeof body?.email === 'string' ? body.email.trim() : ''
  if (decoy || !(await passwordMatches(candidate))) {
    await new Promise(r => setTimeout(r, 800)) // slows down guessing
    return NextResponse.json({ error: 'That password is not right.', code: 'BR-PRE-001' }, { status: 401 })
  }
  const gate = await prelaunchToken(process.env.PRELAUNCH_PASSWORD as string)

  // The password is right, so the site always opens. Signing in as the Preview account needs the Firebase
  // service account; if that part fails, still let them in and report why (logged in Vercel as well).
  try {
    await ensurePreviewUser()
    const customToken = await adminAuth().createCustomToken(PREVIEW_UID, { developer: true })
    return NextResponse.json({ ok: true, gate, customToken })
  } catch (e) {
    const code = classifyServerError(e)
    console.error(`[prelaunch unlock] sign-in step failed ${code}`, e)
    return NextResponse.json({ ok: true, gate, customToken: null, warning: code })
  }
}
