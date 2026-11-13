#!/usr/bin/env node
// Pretend BUTT command line for the helper's HTTP test: butt -p PORT <-s|-d|-r|-t|-S|-u text>. State in FAKE_BUTT_STATE.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const f = process.env.FAKE_BUTT_STATE
let st = { connected: 0, recording: 0, n: 0, path: '' }
try { st = JSON.parse(readFileSync(f, 'utf8')) } catch {}
const cmd = process.argv[4]
if (cmd === '-s') st.connected = 1
if (cmd === '-d') st.connected = 0
if (cmd === '-r') { st.recording = 1; st.n++; st.path = join(process.env.FAKE_BUTT_DIR, 'butt-rec.mp3'); writeFileSync(st.path, Buffer.alloc(3_000_000, st.n)) }
if (cmd === '-t') st.recording = 0
writeFileSync(f, JSON.stringify(st))
// Like BUTT 1.47: a second status request within one second is refused.
if (cmd === '-S' && process.env.FAKE_BUTT_RATELIMIT === '1') {
  const lf = `${f}.last`
  let last = 0
  try { last = Number(readFileSync(lf, 'utf8')) } catch {}
  if (Date.now() - last < 1000) { console.log('Error: You may only request one status packet per second'); process.exit(1) }
  writeFileSync(lf, String(Date.now()))
}
if (cmd === '-S') {
  console.log(`connected: ${st.connected}\nconnecting: 0\nrecording: ${st.recording}\nsignal present: 1\nsignal absent: 0\nstream seconds: 0\nstream kByte: 0\nrecord seconds: 0\nrecord kByte: 0\nvolume left: -20\nvolume right: -20\nsong: \nrecord path: ${st.recording ? st.path : ''}\nlistener: 0`)
}
