// Firestore rules test for the library worker. Needs the emulator (Java), so it is not part of `npm test`. Run:
//   npm i --no-save @firebase/rules-unit-testing firebase
//   npx firebase-tools emulators:exec --only firestore --project demo-babsonradio "node --test tests/rules/worker.rules.test.mjs"
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore'

let env
const nowSec = () => Math.floor(Date.now() / 1000)
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-babsonradio', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } })
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin1'), { level: 'admin', email: 'a@babson.edu' })
    await setDoc(doc(db, 'users/student1'), { level: 'student', email: 's@babson.edu' })
    await setDoc(doc(db, 'users/studio-worker'), { level: 'admin', email: 'x@babson.edu' }) // even if such a user doc existed, the worker gets nothing outside its three collections
    await setDoc(doc(db, 'workerJobs/j1'), { type: 'library.scan', params: {}, status: 'queued', createdBy: 'admin1', createdAt: Timestamp.now() })
    await setDoc(doc(db, 'workerJobs/j2'), { type: 'library.scan', params: {}, status: 'cancelled', createdBy: 'admin1', createdAt: Timestamp.now() })
    await setDoc(doc(db, 'workerProposals/s1'), { songId: 's1', status: 'approved', proposed: { title: 'A' }, updatedAt: Timestamp.now() })
    await setDoc(doc(db, 'workerProposals/s2'), { songId: 's2', status: 'pending', proposed: { title: 'B' }, updatedAt: Timestamp.now() })
    await setDoc(doc(db, 'workerProposals/s3'), { songId: 's3', status: 'rejected', proposed: { title: 'C' }, updatedAt: Timestamp.now() })
  })
})
after(async () => { await env.cleanup() })

const worker = (over = {}) => env.authenticatedContext('studio-worker', { worker: true, auth_time: nowSec(), ...over }).firestore()
const admin = () => env.authenticatedContext('admin1', { email: 'a@babson.edu', email_verified: true }).firestore()
const student = () => env.authenticatedContext('student1', { email: 's@babson.edu', email_verified: true }).firestore()

test('worker reads its three collections and nothing else', async () => {
  const db = worker()
  await assertSucceeds(getDoc(doc(db, 'workerJobs/j1')))
  await assertSucceeds(getDoc(doc(db, 'workerProposals/s1')))
  await assertSucceeds(getDoc(doc(db, 'workerStatus/pc')))
  for (const p of ['users/admin1', 'users/studio-worker', 'config/autoScheduler', 'libraryChanges/x', 'libraryBeats/a', 'launchEmail/x', 'presence/x']) await assertFails(getDoc(doc(db, p)))
})
test('a worker session older than an hour (plus slack) is refused', async () => {
  await assertFails(getDoc(doc(worker({ auth_time: nowSec() - 4000 }), 'workerJobs/j1')))
  await assertSucceeds(getDoc(doc(worker({ auth_time: nowSec() - 3000 }), 'workerJobs/j1')))
})
test('only the studio-worker uid with the worker claim counts as the worker', async () => {
  await assertFails(getDoc(doc(env.authenticatedContext('studio-worker', { auth_time: nowSec() }).firestore(), 'workerJobs/j1')))
  await assertFails(getDoc(doc(env.authenticatedContext('someone', { worker: true, auth_time: nowSec() }).firestore(), 'workerJobs/j1')))
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'workerJobs/j1')))
})
test('admins read the three collections but write nothing; students and signed-out see nothing', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'workerJobs/j1')))
  await assertSucceeds(getDoc(doc(admin(), 'workerProposals/s1')))
  await assertSucceeds(getDoc(doc(admin(), 'workerStatus/pc')))
  await assertFails(setDoc(doc(admin(), 'workerProposals/s9'), { songId: 's9', status: 'approved' }))
  await assertFails(updateDoc(doc(admin(), 'workerProposals/s2'), { status: 'approved' }))
  await assertFails(setDoc(doc(admin(), 'workerStatus/pc'), { lastSeen: Timestamp.now() }))
  await assertFails(getDoc(doc(student(), 'workerJobs/j1')))
  await assertFails(getDoc(doc(student(), 'workerProposals/s1')))
})
test('nobody can create or delete a job from a client (admin and worker included)', async () => {
  const job = { type: 'library.scan', params: {}, status: 'queued', createdBy: 'x', createdAt: Timestamp.now() }
  for (const db of [worker(), admin(), student()]) { await assertFails(setDoc(doc(db, 'workerJobs/new'), job)); await assertFails(deleteDoc(doc(db, 'workerJobs/j1'))) }
})
test('worker updates progress and final state of a job, but cannot cancel, requeue or edit other fields', async () => {
  const db = worker()
  await assertSucceeds(updateDoc(doc(db, 'workerJobs/j1'), { status: 'running', startedAt: Timestamp.now(), progress: { done: 1, total: 10, note: '' } }))
  await assertSucceeds(updateDoc(doc(db, 'workerJobs/j1'), { status: 'done', finishedAt: Timestamp.now() }))
  await assertFails(updateDoc(doc(db, 'workerJobs/j1'), { status: 'queued' }))
  await assertFails(updateDoc(doc(db, 'workerJobs/j2'), { status: 'running' })) // cancelled by an admin: the worker may not revive it
  await assertFails(updateDoc(doc(db, 'workerJobs/j1'), { type: 'library.apply' }))
})
test('worker proposals: create pending only; approved ones only become applied or failed; rejected stay rejected', async () => {
  const db = worker()
  await assertSucceeds(setDoc(doc(db, 'workerProposals/n1'), { songId: 'n1', status: 'pending', proposed: { title: 'X' }, updatedAt: Timestamp.now() }))
  await assertFails(setDoc(doc(db, 'workerProposals/n2'), { songId: 'n2', status: 'approved', proposed: { title: 'X' } }))
  await assertFails(setDoc(doc(db, 'workerProposals/n3'), { songId: 'other', status: 'pending' }))
  await assertFails(updateDoc(doc(db, 'workerProposals/s2'), { status: 'approved' }))
  await assertSucceeds(updateDoc(doc(db, 'workerProposals/s2'), { status: 'pending', 'proposed.title': 'B2' }))
  await assertFails(updateDoc(doc(db, 'workerProposals/s1'), { 'proposed.title': 'Changed after approval' }))
  await assertFails(updateDoc(doc(db, 'workerProposals/s1'), { status: 'pending' }))
  await assertFails(updateDoc(doc(db, 'workerProposals/s3'), { status: 'pending' }))
  await assertFails(deleteDoc(doc(db, 'workerProposals/s1')))
  await assertSucceeds(updateDoc(doc(db, 'workerProposals/s1'), { status: 'applied', updatedAt: Timestamp.now() }))
})
test('worker heartbeat', async () => {
  await assertSucceeds(setDoc(doc(worker(), 'workerStatus/pc'), { lastSeen: Timestamp.now(), version: '1', currentJobId: null, liveNow: false }))
})
