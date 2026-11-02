// npm run e2e: both phases in one shared temporary folder (dry run first, then apply and undo).
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'pcw-e2e-'))
const run = fileURLToPath(new URL('./run.mjs', import.meta.url))
for (const phase of ['propose', 'apply']) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', run, phase], { stdio: 'inherit', env: { ...process.env, E2E_DIR: dir } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
