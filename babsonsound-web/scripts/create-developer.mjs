// Creates (or updates) a developer account: real Firebase login, no babson.edu email, no phone.
//
//   node --env-file=.env.local scripts/create-developer.mjs you@example.com "Ryan"
//   (optional) DEV_PASSWORD=... to choose the password; otherwise a random one is printed once.
//
// Needs FIREBASE_SERVICE_ACCOUNT_JSON in the environment (see .env.example).
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'

const [email, name = 'Developer'] = process.argv.slice(2)
if (!email || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Usage: node --env-file=.env.local scripts/create-developer.mjs <email> [name]')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
const auth = getAuth()
const db = getFirestore()

const password = process.env.DEV_PASSWORD ?? randomBytes(12).toString('base64url')
let user
let created = false
try {
  user = await auth.getUserByEmail(email)
  if (process.env.DEV_PASSWORD) await auth.updateUser(user.uid, { password })
} catch {
  user = await auth.createUser({ email, password, displayName: name, emailVerified: true })
  created = true
}

await auth.setCustomUserClaims(user.uid, { developer: true })
await db.collection('users').doc(user.uid).set({
  firstName: name, displayName: name, email: email.toLowerCase(),
  role: 'developer', accountType: 'developer',
  hostOfShows: [], notifyNewEpisode: [], notifyGoesLive: [],
  joinedAt: Timestamp.now(),
}, { merge: true })

console.log(`${created ? 'Created' : 'Updated'} developer ${email} (uid ${user.uid})`)
if (created || process.env.DEV_PASSWORD) console.log(`Password: ${password}`)
else console.log('Existing account: password unchanged.')
console.log('Sign out and back in for the new claim to take effect.')
