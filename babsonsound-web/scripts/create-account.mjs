// Creates (or updates) an admin account or the hidden App Store reviewer account. Replaces create-developer.mjs.
//
//   node --env-file=.env.local scripts/create-account.mjs admin you@example.com "Ryan"
//   node --env-file=.env.local scripts/create-account.mjs demo reviewer@example.com "App Review"
//
//   admin  level admin. The server only honors an admin or director who has a school email, so for an address
//          that is not babson.edu, olin.edu or wellesley.edu, add it to OWNER_EMAILS in Vercel as well.
//   demo   level student with demo: true (the one hidden reviewer account: treated as school-verified, skips the
//          phone/birthday step, not listed in /admin/users, never emailed). Give App Review its email and password.
//
// (optional) ACCOUNT_PASSWORD=... to choose the password; otherwise a random one is printed once.
// Needs FIREBASE_SERVICE_ACCOUNT_JSON in the environment (see .env.example).
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'

const [kind, email, name = kind === 'demo' ? 'App Review' : 'Admin'] = process.argv.slice(2)
if (!['admin', 'demo'].includes(kind) || !email || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Usage: node --env-file=.env.local scripts/create-account.mjs <admin|demo> <email> [name]')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
const auth = getAuth(), db = getFirestore()

const password = process.env.ACCOUNT_PASSWORD ?? randomBytes(12).toString('base64url')
let user, created = false
try {
  user = await auth.getUserByEmail(email)
  if (process.env.ACCOUNT_PASSWORD) await auth.updateUser(user.uid, { password })
} catch {
  user = await auth.createUser({ email, password, displayName: name, emailVerified: true })
  created = true
}

await db.collection('users').doc(user.uid).set({
  firstName: name, displayName: name, email: email.toLowerCase(),
  level: kind === 'admin' ? 'admin' : 'student',
  // The demo account holds both badges (no expiry) so App Review can reach studio booking and live Host a show.
  studioTrained: kind === 'demo', radioTrained: kind === 'demo',
  accountType: 'babson',
  ...(kind === 'demo' ? { demo: true, unsubscribed: true } : {}),
  notifyNewEpisode: [], notifyGoesLive: [],
  joinedAt: Timestamp.now(),
}, { merge: true })

console.log(`${created ? 'Created' : 'Updated'} ${kind} account ${email} (uid ${user.uid})`)
if (created || process.env.ACCOUNT_PASSWORD) console.log(`Password: ${password}`)
else console.log('Existing account: password unchanged.')
if (kind === 'admin' && !/@(babson|olin|wellesley)\.edu$/i.test(email)) console.log('This is not a school email: add it to OWNER_EMAILS in Vercel or the server will treat it as a guest.')
