// Usage: node tools/encrypt-stream.mjs "<stream url>" "<password>"
// Prints the VAULT constants to paste into js/babson-sound.js.
// The stream URL is encrypted (PBKDF2-SHA256 -> AES-256-GCM) so it never appears in the page source in plain text.
import { webcrypto as crypto } from 'node:crypto';
const [url, password] = process.argv.slice(2);
if (!url || !password) { console.error('usage: node tools/encrypt-stream.mjs "<stream url>" "<password>"'); process.exit(1); }
const ITER = 250000, enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(url)));
const b64 = (u) => Buffer.from(u).toString('base64');
console.log(`var VAULT = { i: ${ITER}, s: '${b64(salt)}', v: '${b64(iv)}', c: '${b64(ct)}' };`);
