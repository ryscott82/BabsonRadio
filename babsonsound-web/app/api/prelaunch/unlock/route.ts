import { NextResponse } from 'next/server'
import { PRELAUNCH_COOKIE, passwordMatches, prelaunchToken } from '@/lib/prelaunch'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const candidate = typeof body?.password === 'string' ? body.password.slice(0, 200) : ''
  // The email box on the form is a decoy. Real developers leave it blank; anything typed in it fails the unlock.
  const decoy = typeof body?.email === 'string' ? body.email.trim() : ''
  if (decoy || !(await passwordMatches(candidate))) {
    await new Promise(r => setTimeout(r, 800)) // slows down guessing
    return NextResponse.json({ error: 'That password is not right.', code: 'BR-PRE-001' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PRELAUNCH_COOKIE, await prelaunchToken(process.env.PRELAUNCH_PASSWORD as string), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
