// Writes ERROR_CODES.md (staff key, includes what to check) from lib/error-codes.json.
// Run after editing the JSON:  node scripts/gen-error-docs.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const list = JSON.parse(readFileSync(new URL('../lib/error-codes.json', import.meta.url), 'utf8'))
const areas = { AUTH: 'Signing in', ACC: 'Accounts', GST: 'Guest access', NET: 'Contacts & friends',
  SLT: 'Air-time requests', PERM: 'Permissions', PRE: 'Pre-launch', REQ: 'Requests', SRV: 'Server / setup', CLI: 'App & connection' }

let md = `# Babson Radio error codes (staff key)\n\nGenerated from \`lib/error-codes.json\`. Public version: \`/support/errors\`.\nFormat: \`BR-<AREA>-<NNN>\`. Unexpected server errors also show a \`ref\`: search Vercel → Logs for it.\n`
for (const [a, title] of Object.entries(areas)) {
  const items = list.filter(e => e.code.startsWith(`BR-${a}-`))
  if (!items.length) continue
  md += `\n## ${title}\n\n| Code | What it is | What the user should do | What staff check |\n|---|---|---|---|\n`
  for (const e of items) md += `| ${e.code} | **${e.title}**: ${e.meaning} | ${e.userFix} | ${e.staffCheck || '—'} |\n`
}
writeFileSync(new URL('../ERROR_CODES.md', import.meta.url), md)
console.log(`Wrote ERROR_CODES.md (${list.length} codes)`)
