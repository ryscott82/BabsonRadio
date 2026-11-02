'use client'

import { useEffect, useState } from 'react'
import Modal from './Modal'

// Which sound devices the studio page uses. Saved on this PC.
//  - input: the mixer feed (the same one BUTT streams), for the level meter
//  - music: where background music and the jingle buttons play (a mixer channel or virtual cable that goes on air)

export interface Devices { input: string; music: string }

export default function DeviceSettings({ value, onChange, refresh, onClose }: {
  value: Devices; onChange: (d: Devices) => void; refresh: number; onClose: () => void
}) {
  const [list, setList] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const load = () => navigator.mediaDevices?.enumerateDevices().then(setList).catch(() => setList([]))
    load()
    navigator.mediaDevices?.addEventListener('devicechange', load)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load)
  }, [refresh])

  const ins = list.filter(d => d.kind === 'audioinput'), outs = list.filter(d => d.kind === 'audiooutput')
  const pick = (label: string, help: string, key: keyof Devices, opts: MediaDeviceInfo[]) => (
    <label className="block space-y-1.5">
      <span className="block hw-title text-2xl">{label}</span>
      <select value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} className="gfield w-full px-4 h-14 text-xl">
        <option value="">System default</option>
        {opts.filter(d => d.deviceId && d.deviceId !== 'default').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Unnamed device'}</option>)}
      </select>
      <span className="block text-lg lbl">{help}</span>
    </label>
  )
  return (
    <Modal onClose={onClose}>
      <div className="space-y-6">
        <h2 className="hw-title text-4xl">Audio setup</h2>
        <p className="lbl text-xl">Which sound devices this computer uses. Set once; it’s remembered.</p>
        {pick('Mixer input', 'The same input BUTT streams. The level meter listens to it.', 'input', ins)}
        {pick('Music output', 'Where tracks and sound pads play. It has to feed into the mixer.', 'music', outs)}
        <button type="button" onClick={onClose} className="gbtn gbtn-go w-full h-16 text-2xl">Done</button>
      </div>
    </Modal>
  )
}
