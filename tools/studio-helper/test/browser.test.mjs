import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBrowser, safeUrl } from '../lib/browser.mjs'

function setup({ placeOk = true } = {}) {
  let saved = null
  const procs = new Set(), calls = []
  let next = 100
  const b = createBrowser({
    chrome: 'chrome.exe', profileDir: 'C:\\p\\BabsonRadioBrowser',
    spawn: (cmd, args) => { const pid = next++; procs.add(pid); calls.push({ spawn: args }); return { pid } },
    place: async (pid, layout) => { calls.push({ place: pid, layout }); return placeOk ? pid : 0 },
    kill: pid => { procs.delete(pid); calls.push({ kill: pid }) },
    alive: pid => procs.has(pid),
    store: { load: () => saved, save: v => { saved = v } },
  })
  return { b, calls, procs, saved: () => saved }
}

test('only web addresses', () => {
  assert.equal(safeUrl('https://www.youtube.com'), 'https://www.youtube.com/')
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('file:///C:/Windows'), '')
  assert.equal(safeUrl('not a url'), '')
})

test('opens split by default with its own profile, a second link becomes a tab in the same window', async () => {
  const s = setup()
  assert.deepEqual(s.b.state(), { open: false, layout: '', railPx: 260 })
  const o = await s.b.open('https://docs.google.com'); assert.equal(o.open, true); assert.equal(o.layout, 'split'); assert.ok(o.since > 0)
  assert.ok(s.calls[0].spawn.includes('--user-data-dir=C:\\p\\BabsonRadioBrowser') && s.calls[0].spawn.includes('--new-window'))
  await s.b.open('https://www.notion.so', 'split')
  assert.ok(!s.calls[2].spawn.includes('--new-window'), 'a tab, not another window')
  assert.equal(s.calls[3].place, 100, 'the same window is placed')
})

test('full screen and back, close kills the window, closing it by hand is noticed', async () => {
  const s = setup()
  await s.b.open('https://www.youtube.com')
  assert.equal((await s.b.layout('full')).layout, 'full')
  assert.equal((await s.b.layout('split')).layout, 'split')
  await assert.rejects(s.b.layout('sideways'), /Unknown layout/)
  assert.deepEqual(s.b.close(), { open: false, layout: '', railPx: 260 })
  assert.equal(s.saved(), null)
  await s.b.open('https://www.youtube.com')
  s.procs.clear() // someone closed the window
  assert.equal(s.b.state().open, false)
  assert.equal(s.saved(), null)
})

test('refuses non-web links, and says so when the window never appears', async () => {
  const s = setup({ placeOk: false })
  await assert.rejects(s.b.open('ftp://x'), /web address/)
  await assert.rejects(s.b.open('https://www.youtube.com'), /did not open/)
  assert.equal(s.b.state().open, false)
})
