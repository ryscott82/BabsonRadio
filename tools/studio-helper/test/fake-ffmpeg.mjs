#!/usr/bin/env node
// Pretend ffmpeg/ffprobe for the helper's HTTP test. ffmpeg: joins the bytes of the files in the concat list. ffprobe: prints 12.5.
import { readFileSync, writeFileSync } from 'node:fs'
const a = process.argv.slice(2)
if (a.includes('-show_entries')) { console.log('12.5'); process.exit(0) }
const list = readFileSync(a[a.indexOf('-i') + 1], 'utf8').split('\n').map(l => /^file '(.*)'$/.exec(l)?.[1]?.replace(/'\\''/g, "'")).filter(Boolean)
writeFileSync(a[a.length - 1], Buffer.concat(list.map(f => readFileSync(f))))
