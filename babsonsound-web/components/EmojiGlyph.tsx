/* eslint-disable @next/next/no-img-element */
// A reaction, drawn: normal emoji as text, the beaver logo (":br:") as the logo image, and the Pittsburgh set (":pgh-*:") as drawings.
export default function EmojiGlyph({ e, size }: { e: string; size?: number | string }) {
  if (e === ':br:') return <img src="/beaver.png" alt="" draggable={false} style={{ height: size ?? '1.25em', width: 'auto', display: 'inline-block' }} />
  if (/^:pgh-[a-z]+:$/.test(e)) return <img src={`/pgh/${e.slice(5, -1)}.svg`} alt="" draggable={false} style={{ height: size ?? '1.25em', width: 'auto', display: 'inline-block' }} />
  return <>{e}</>
}
