/* eslint-disable @next/next/no-img-element */
// A reaction, drawn: normal emoji as text, the beaver logo (":br:") as the logo image.
export default function EmojiGlyph({ e, size }: { e: string; size?: number | string }) {
  if (e === ':br:') return <img src="/beaver.png" alt="" draggable={false} style={{ height: size ?? '1.25em', width: 'auto', display: 'inline-block' }} />
  return <>{e}</>
}
