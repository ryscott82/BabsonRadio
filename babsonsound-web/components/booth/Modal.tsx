'use client'

import { createPortal } from 'react-dom'

/** Full-screen dimmed overlay with a glass panel, rendered at the end of <body> so nothing can cover it. */
export default function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/65 flex items-center justify-center p-8" onClick={onClose}>
      <div className="hw-screen w-full max-w-xl p-9" onClick={e => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  )
}
