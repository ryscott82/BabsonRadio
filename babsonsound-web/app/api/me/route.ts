import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/admin'
import { removeContactGraph } from '@/lib/server/contactGraph'
import { ensureProfile } from '@/lib/server/profile'
import { finishSchoolUpgrade } from '@/lib/server/upgrade'
import { cleanBirthday } from '@/lib/server/birthdays'
import { PUBLIC_AGREEMENT_VERSION, PUBLIC_CLAUSES } from '@/lib/publicContent'
import { CONCENTRATIONS, MAX_CONCENTRATIONS, TERMS_VERSION, normText, validGradYear } from '@/lib/terms'
import { AVATAR_COLORS, DEFAULT_AVATAR, MAX_HOST_EMOJIS } from '@/lib/profile'
import { HttpError, handle, readJson, requireUser, str } from '@/lib/server/http'
import { accessOf, forgetAccess } from '@/lib/server/access'
import { setupFor } from '@/lib/server/setup'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  return handle(async () => {
    const t = await requireUser(req)
    // A guest who just signed in with their confirmed school email becomes a student here.
    if (t.email_verified === true && await finishSchoolUpgrade(adminDb(), t).catch(() => false)) forgetAccess(t.uid)
    const a = await accessOf(t)
    // Sign in with Apple can arrive before its profile exists: make it now.
    let u = await adminDb().collection('users').doc(t.uid).get()
    if (!u.exists && await ensureProfile(t)) u = await adminDb().collection('users').doc(t.uid).get()
    if (!u.exists) throw new HttpError(404, 'Profile not found.')
    return {
      uid: t.uid,
      firstName: u.get('firstName') ?? u.get('displayName') ?? '',
      lastName: u.get('lastName') ?? '',
      username: u.get('username') ?? '',
      email: u.get('email') ?? t.email ?? '',
      phoneNumber: u.get('phoneNumber') ?? '',
      level: a.level,
      studioTrained: a.studio,
      radioTrained: a.radio,
      isBabson: a.level !== 'guest',
      invisible: u.get('invisible') === true,
      avatarColor: u.get('avatarColor') ?? DEFAULT_AVATAR,
      joinedAt: (u.get('joinedAt') as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
      hostPrefs: {
        theme: ['standard', 'art'].includes(u.get('hostPrefs')?.theme) ? u.get('hostPrefs').theme : 'auto',
        emojis: Array.isArray(u.get('hostPrefs')?.emojis) ? u.get('hostPrefs').emojis : [],
        ratings: u.get('hostPrefs')?.ratings !== false,
      },
      gradYear: u.get('gradYear') ?? '',
      concentrations: u.get('concentrations') ?? [],
      birthday: cleanBirthday(u.get('birthday')),
      // False until the one-time "about you" step (name, phone, birthday or age range) is done.
      onboarded: u.get('onboardedAt') != null,
      // 'adult' only when the profile says 18+. Drives the "make public" option; minors and unknowns never see it.
      publicClauses: PUBLIC_CLAUSES, publicVersion: PUBLIC_AGREEMENT_VERSION,
      publicSharing: u.get('minor') === true ? 'minor' : (u.get('minor') === false && u.get('onboardedAt') != null ? 'adult' : 'unknown'),
      // Progressive setup (lib/setup.ts). `next` is the one step to ask about now. Add ?prompt=1 once at the start of a visit to
      // record that it was shown (then `next` is null for 30 minutes); every other caller just looks.
      setup: await setupFor(t, a, u, new URL(req.url).searchParams.get('prompt') === '1'),
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
    if ('avatarColor' in b) {
      if (!AVATAR_COLORS.some(c => c.id === b.avatarColor)) throw new HttpError(400, 'Pick one of the colors.')
      update.avatarColor = b.avatarColor
    }
    // What a host picks for their own shows (Go on air, bottom of the page).
    if (b.hostPrefs && typeof b.hostPrefs === 'object') {
      const hp = b.hostPrefs as Record<string, unknown>
      const emojis = [...new Set((Array.isArray(hp.emojis) ? hp.emojis : []).map(e => str(e, 8)).filter(e => e && /\p{Extended_Pictographic}/u.test(e)))]
      if (emojis.length > MAX_HOST_EMOJIS) throw new HttpError(400, `Pick up to ${MAX_HOST_EMOJIS} reactions.`)
      // Dotted paths so the ratings setting is never touched here: it is chosen when a show is booked and cannot change mid-show.
      update['hostPrefs.theme'] = ['standard', 'art'].includes(String(hp.theme)) ? hp.theme : 'auto'
      update['hostPrefs.emojis'] = emojis
    }
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
