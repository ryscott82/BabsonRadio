// Puts a throwaway test account into the Firebase EMULATOR so you can try sign-in and the new-user flow.
// It refuses to run unless the emulator addresses are set, so it can never write to the real project. The emulator keeps
// everything in memory: stop it and the account is gone.
//
//   terminal 1:  npm run emulators
//   terminal 2:  npm run seed:test
//   terminal 3:  npm run dev:emulated      then sign in at http://localhost:3000/auth
//
// Sign in with test@babsonradio.com / TestPassword21!. To try the brand-new-user flow, sign up with any other email instead.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !/^(127\.0\.0\.1|localhost)/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  console.error('Not running: the Firebase emulator is not set up here. Use npm run seed:test while npm run emulators is running.')
  process.exit(1)
}
initializeApp({ projectId: 'demo-babsonradio' })
const email = 'test@babsonradio.com', password = 'TestPassword21!'
const auth = getAuth()
try { await auth.deleteUser((await auth.getUserByEmail(email)).uid) } catch { /* not there yet */ }
await auth.createUser({ email, password, emailVerified: true })
console.log(`Test account ready in the emulator: ${email}`)
