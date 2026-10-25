'use client'

import { useRef, useState } from 'react'
import { uploadImage, type UploadedImage } from '@/lib/image'

// Optional picture: pick a file, it is shrunk and uploaded right away.
export default function ImagePicker({ scope, value, onChange }: {
  scope: 'slot' | 'show'
  value: { url: string; path: string } | null
  onChange: (v: UploadedImage | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(file?: File) {
    if (!file) return
    setBusy(true); setError('')
    try { onChange(await uploadImage(file, scope)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.') }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div>
      <span className="block text-sm text-br-dk-sub mb-1.5 font-display tracking-widest">Picture (optional)</span>
      <div className="flex items-center gap-4">
        {value
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={value.url} alt="" className="w-20 h-20 rounded-lg object-cover sk-raised" />
          : <div className="w-20 h-20 rounded-lg sk-field flex items-center justify-center text-br-dk-muted text-sm">None</div>}
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
                  className="sk-key rounded-lg px-4 py-2 text-sm font-display tracking-widest text-br-dk-text disabled:opacity-50">
            {busy ? 'UPLOADING…' : value ? 'CHANGE' : 'ADD PICTURE'}
          </button>
          {value && !busy && (
            <button type="button" onClick={() => onChange(null)} className="block text-sm text-br-dk-sub hover:text-br-red">Remove</button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-br-red text-sm mt-2">{error}</p>}
    </div>
  )
}
