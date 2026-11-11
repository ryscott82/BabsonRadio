// Read-only: lists every Firebase Auth account that has ever signed in with Apple (provider apple.com), so each can be given
// a password reset or deleted now that Sign in with Apple is gone. Nothing is changed.
//
//   node --env-file=.env.local scripts/list-apple-accounts.mjs
//
// Needs FIREBASE_SERVICE_ACCOUNT_JSON in the environment (see .env.example).
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON (node --env-file=.env.local scripts/list-apple-accounts.mjs)')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
const auth = getAuth()

const rows = []
let token
do {
  const page = await auth.listUsers(1000, token)
  token = page.pageToken
  for (const u of page.users) {
    if (!u.providerData.some(p => p.providerId === 'apple.com')) continue
    rows.push({
      uid: u.uid,
      email: u.email ?? '(none)',
      providers: u.providerData.map(p => p.providerId).join('+'),
      hasPassword: u.providerData.some(p => p.providerId === 'password'),
      created: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
    })
  }
} while (token)

if (!rows.length) console.log('No accounts use Sign in with Apple.')
else {
  console.table(rows)
  console.log(`${rows.length} account(s). Accounts with hasPassword=false cannot sign in at all now: send a password reset (Firebase console > Authentication > Users > ... > Reset password) or delete them.`)
}
