import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREW_FRESH_MS, CREW_MAX, addCrew, crewFresh, crewList, handOff, hostsWith, type CrewDoc } from './crew.ts'

const doc = (): CrewDoc => ({ driverUid: 'd', driverName: 'Dana Day', sessionId: 's1', updatedAt: 1000, members: {} })
const p = (uid: string) => ({ uid, name: `${uid} Name`, firstName: uid })

test('freshness', () => {
  assert.equal(crewFresh(doc(), 1000 + CREW_FRESH_MS - 1), true)
  assert.equal(crewFresh(doc(), 1000 + CREW_FRESH_MS + 1), false)
  assert.equal(crewFresh(null, 5), false)
})
test('addCrew: joins once, driver and repeats change nothing, capped', () => {
  const a = addCrew(doc(), p('a'), 2000)
  assert.equal(a.added, true); assert.deepEqual(crewList(a.doc).map(x => x.uid), ['a'])
  assert.equal(addCrew(a.doc, p('a'), 3000).added, false)
  assert.equal(addCrew(a.doc, p('d'), 3000).added, false)
  let d = doc()
  for (let i = 0; i < CREW_MAX; i++) d = addCrew(d, p(`u${i}`), 2000 + i).doc
  const over = addCrew(d, p('late'), 9000)
  assert.equal(over.added, false); assert.equal(over.full, true)
})
test('crewList is in join order', () => {
  let d = addCrew(doc(), p('b'), 3000).doc
  d = addCrew(d, p('a'), 2000).doc
  assert.deepEqual(crewList(d).map(x => x.uid), ['a', 'b'])
})
test('handOff swaps driver and crew member', () => {
  const d = addCrew(doc(), p('a'), 2000).doc
  const h = handOff(d, 'a', 'Dana', 5000)!
  assert.equal(h.doc.driverUid, 'a'); assert.equal(h.doc.members['d'].firstName, 'Dana'); assert.equal(h.doc.members['a'], undefined)
  assert.equal(handOff(d, 'nobody', 'Dana', 5000), null)
})
test('hostsWith seeds the driver and removes repeats', () => {
  assert.deepEqual(hostsWith([], 'Dana Day', 'Alex Roe'), ['Dana Day', 'Alex Roe'])
  assert.deepEqual(hostsWith(['Show Team'], 'Dana Day', 'alex roe'), ['Show Team', 'alex roe'])
  assert.deepEqual(hostsWith(['Alex Roe'], 'Dana Day', 'ALEX ROE'), ['Alex Roe'])
})
