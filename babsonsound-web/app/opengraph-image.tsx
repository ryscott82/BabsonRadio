import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Babson Radio'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The picture that shows when the site is shared in Messages, Instagram, Slack, etc.
export default async function Image() {
  const beaver = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/beaver.png'))).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 96, position: 'relative', background: '#006644', color: '#ffffff' }}>
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -3 }}>Babson Radio</div>
        <div style={{ fontSize: 40, marginTop: 24, opacity: 0.85, maxWidth: 700, lineHeight: 1.2 }}>The first all-internet radio station in the United States</div>
        <div style={{ fontSize: 32, marginTop: 12, opacity: 0.7 }}>Student-run since 1998</div>
        <div style={{ fontSize: 32, marginTop: 56, opacity: 0.7 }}>babsonradio.com</div>
        <img src={beaver} width={400} height={400} alt="" style={{ position: 'absolute', right: 70, bottom: 60 }} />
      </div>
    ),
    size,
  )
}
