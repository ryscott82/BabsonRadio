// Usage: node tools/inline-js.mjs        (run from the belongpage folder)
// Campus Groups rewrites "{" and "}" in page content as %7B / %7D, which breaks inline JavaScript.
// So each page carries the script as base64 (no braces) plus a tiny loader. Re-run this after editing js/babson-sound.js.
import { readFileSync, writeFileSync } from 'node:fs';
const js = readFileSync('js/babson-sound.js', 'utf8');
if (/[^\x00-\x7f]/.test(js)) { console.error('js/babson-sound.js must be ASCII only'); process.exit(1); }
const b64 = Buffer.from(js, 'utf8').toString('base64');
const block = `<script id="br-site-js">Function(atob("${b64}"))()</script>\n`;
for (const f of ['home.html', 'events.html', 'leadership-team.html']) {
  let s = readFileSync(f, 'utf8').replace(/<script id="br-site-js">[\s\S]*?<\/script>\n?/, '').replace(/\s*$/, '\n');
  writeFileSync(f, s + block);
  console.log(f, 'ok');
}
