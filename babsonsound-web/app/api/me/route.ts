import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { removeContactGraph } from '@/lib/server/contactGraph'
import { isTester } from '@/lib/server/testers'
import { finishSchoolUpgrade } from '@/lib/server/upgrade'
import { cleanBirthday } from '@/lib/server/birthdays'
import { CONCENTRATIONS, MAX_CONCENTRATIONS, TERMS_VERSION, normText, validGradYear } from '@/lib/terms'
import { HttpError, handle, isBabsonToken, isDeveloperToken, readJson, requireUser, str } from '@/lib/server/http'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    // A guest who just signed in with their confirmed school email becomes a student here.
    if (isBabsonToken(t)) await finishSchoolUpgrade(adminDb(), t).catch(() => {})
    const u = await adminDb().collection('users').doc(t.uid).get()
    if (!u.exists) throw new HttpError(404, 'Profile not found.')
    return {
      uid: t.uid,
      firstName: u.get('firstName') ?? u.get('displayName') ?? '',
      lastName: u.get('lastName') ?? '',
      username: u.get('username') ?? '',
      email: u.get('email') ?? t.email ?? '',
      phoneNumber: u.get('phoneNumber') ?? '',
      role: u.get('role') ?? 'listener',
      isDeveloper: isDeveloperToken(t),
      isBabson: isBabsonToken(t),
      isTester: t.tester === true || (await isTester(t.email)),
      invisible: u.get('invisible') === true,
      gradYear: u.get('gradYear') ?? '',
      concentrations: u.get('concentrations') ?? [],
      birthday: cleanBirthday(u.get('birthday')),
      // False until the one-time "about you" step (name, phone, birthday or age range) is done.
      onboarded: u.get('onboardedAt') != null,
    }
  })
}

// Edit your own first name and/or turn invisible mode on or off.
// Invisible: you don't show up in anyone's "tuned in" list, your likes aren't shown to friends, your contacts are not
// used for "saved by members" suggestions, and live reactions (sending and seeing them) are off.
export async function POST(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    const b = await readJson(req)
    const update: Record<string, unknown> = {}
    if ('firstName' in b) {
      const firstName = str(b.firstName, 40)
      if (!firstName) throw new HttpError(400, 'Enter a first name.')
      update.firstName = firstName
      update.displayName = firstName
    }
    if ('lastName' in b) {
      const lastName = str(b.lastName, 60)
      if (!lastName) throw new HttpError(400, 'Enter a last name.')
      update.lastName = lastName
    }
    if (typeof b.invisible === 'boolean') update.invisible = b.invisible
    // Optional "about you" details. They are only ever shown as counts ("3 people in your class are listening").
    if ('gradYear' in b) {
      const y = str(b.gradYear, 10)
      if (y && !validGradYear(y)) throw new HttpError(400, 'Pick a graduation year from the list.')
      update.gradYear = y
    }
    const list = (v: unknown, max: number, norm: (s: string) => string) =>
      [...new Set((Array.isArray(v) ? v : []).map(x => norm(str(x, 60))).filter(Boolean))].slice(0, max)
    if ('concentrations' in b) {
      const picked = list(b.concentrations, MAX_CONCENTRATIONS, normText)
      update.concentrations = CONCENTRATIONS.length ? picked.filter(c => CONCENTRATIONS.includes(c)) : picked
    }
    // Optional birthday (month and day). Send null to remove it.
    if ('birthday' in b) {
      if (b.birthday === null) update.birthday = FieldValue.delete()
      else {
        const bd = cleanBirthday(b.birthday)
        if (!bd) throw new HttpError(400, 'Pick a real month and day.')
        update.birthday = bd
      }
    }
    if (b.acceptTerms === TERMS_VERSION) { update.termsAcceptedAt = FieldValue.serverTimestamp(); update.termsVersion = TERMS_VERSION }
    if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to update.')
    await adminDb().collection('users').doc(t.uid).update(update)
    // Going invisible also takes this person's saved numbers out of the "saved by members" counts.
    if (b.invisible === true) await removeContactGraph(adminDb(), t.uid).catch(e => console.error('[contact graph]', e))
    return { ok: true }
  })
}
