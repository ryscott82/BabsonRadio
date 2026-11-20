import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createButtRestart } from '../lib/buttrestart.mjs'

// A fake BUTT and clock. sleep() moves the clock instead of waiting, so a 30 s wait takes no time.
function fakeButt(o = {}) {
  const b = {
    t: 0, running: o.running ?? true, answering: o.running ?? true, connected: false, connecting: false, recording: false,
    quits: o.quits ?? true, killWorks: o.killWorks ?? true, startsAnswering: o.startsAnswering ?? true,
    calls: { quit: 0, kill: 0, launch: 0, status: 0 }, logs: [], recorder: false, onSleep: null, onQuit: null,
  }
  const deps = {
    now: () => b.t,
    sleep: async ms => { b.t += ms; b.onSleep?.(b) },
    log: (...a) => b.logs.push(a.join(' ')),
    status: async () => {
      b.calls.status++
      if (!b.answering) throw new Error('BUTT did not answer')
      return { connected: b.connected, connecting: b.connecting, recording: b.recording }
    },
    quit: async () => { b.calls.quit++; b.onQuit?.(b); if (b.quits) { b.answering = false; b.running = false } },
    forceKill: async () => { b.calls.kill++; if (b.killWorks) { b.answering = false; b.running = false } },
    isRunning: async () => b.running,
    launch: () => { b.calls.launch++; b.running = true; b.answering = b.startsAnswering },
    recorderActive: () => b.recorder,
  }
  return { b, r: createButtRestart(deps) }
}

test('normal restart: waits about 3 s, quits BUTT, starts it again once, and it answers', async () => {
  const { b, r } = fakeButt()
  assert.equal(await r.request(), 'restarted')
  assert.equal(b.calls.quit, 1); assert.equal(b.calls.kill, 0); assert.equal(b.calls.launch, 1)
  assert.ok(b.running && b.answering)
  assert.ok(b.t >= 3000, 'waited before restarting')
  assert.ok(b.logs.some(l => /BUTT RESTART done/.test(l)))
})

test('busy: streaming, connecting, BUTT recording, or the helper recorder running means no restart', async () => {
  for (const set of [x => (x.connected = true), x => (x.connecting = true), x => (x.recording = true), x => (x.recorder = true)]) {
    const { b, r } = fakeButt()
    set(b)
    assert.equal(await r.request(), 'busy')
    assert.equal(b.calls.quit, 0); assert.equal(b.calls.launch, 0)
  }
})

test('BUTT ignores quit: it is force-closed after 15 s, then started again', async () => {
  const { b, r } = fakeButt({ quits: false })
  assert.equal(await r.request(), 'restarted')
  assert.equal(b.calls.quit, 1); assert.equal(b.calls.kill, 1); assert.equal(b.calls.launch, 1)
  assert.ok(b.t >= 3000 + 15_000, 'gave BUTT 15 s to quit first')
})

test('BUTT cannot be closed at all: no second BUTT is started', async () => {
  const { b, r } = fakeButt({ quits: false, killWorks: false })
  assert.equal(await r.request(), 'stuck')
  assert.equal(b.calls.launch, 0)
  assert.equal(r.restarting(), false)
  assert.ok(b.logs.some(l => /could not be closed/.test(l)))
})

test('BUTT not running: it is started (once), without trying to quit or kill it', async () => {
  const { b, r } = fakeButt({ running: false })
  assert.equal(await r.request(), 'started')
  assert.equal(b.calls.quit, 0); assert.equal(b.calls.kill, 0); assert.equal(b.calls.launch, 1)
})

test('started but never answers: logged after 30 s, not started twice', async () => {
  const { b, r } = fakeButt({ startsAnswering: false })
  assert.equal(await r.request(), 'no-answer')
  assert.equal(b.calls.launch, 1)
  assert.ok(b.logs.some(l => /not answering/.test(l)))
})

test('a show starting during the 3 s wait cancels the restart; during the restart it waits until BUTT is back', async () => {
  // 1. Go live pressed before BUTT was closed: the restart is dropped, Go live goes ahead at once.
  {
    const { b, r } = fakeButt()
    const p = r.request()
    await r.beforeStart()
    assert.equal(await p, 'cancelled')
    assert.equal(b.calls.quit, 0); assert.equal(b.calls.launch, 0)
  }
  // 2. Go live pressed while BUTT is closed: it waits for the restart to finish, so it never starts with BUTT down.
  {
    const { b, r } = fakeButt()
    let startedWhileDown = null
    b.onQuit = x => {
      assert.equal(r.restarting(), true)
      startedWhileDown = 'waiting'
      r.beforeStart().then(() => { startedWhileDown = x.answering ? 'after BUTT was back' : 'while BUTT was down' })
    }
    assert.equal(await r.request(), 'restarted')
    await new Promise(res => setImmediate(res))
    assert.equal(startedWhileDown, 'after BUTT was back')
    assert.equal(b.calls.launch, 1)
  }
  // 3. Nothing pending: beforeStart does not wait.
  {
    const { b, r } = fakeButt()
    await r.beforeStart()
    assert.equal(b.t, 0)
  }
})

test('calls close together are one restart, and another within 20 s is skipped', async () => {
  const { b, r } = fakeButt()
  const [x, y, z] = [r.request(), r.request(), r.request()]
  assert.equal(x, y); assert.equal(y, z)
  assert.equal(await x, 'restarted')
  assert.equal(b.calls.launch, 1)
  assert.equal(await r.request(), 'cooldown', 'within 20 s of the last restart')
  assert.equal(b.calls.launch, 1)
  b.t += 20_000
  assert.equal(await r.request(), 'restarted', 'after 20 s it can restart again')
  assert.equal(b.calls.launch, 2)
})

test('errors are logged and never thrown', async () => {
  const { b } = fakeButt()
  const broken = createButtRestart({
    now: () => 0, sleep: async () => {}, log: (...a) => b.logs.push(a.join(' ')),
    status: async () => ({}), quit: async () => {}, forceKill: async () => {}, launch: () => {}, recorderActive: () => false,
    isRunning: async () => { throw new Error('tasklist broke') },
  })
  assert.equal(await broken.request(), 'error')
  assert.ok(b.logs.some(l => /BUTT RESTART ERROR tasklist broke/.test(l)))
})
