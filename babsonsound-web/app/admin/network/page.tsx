'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '@/lib/auth'

interface Node { id: string; name: string; username: string; friends: number }
interface Data { members: number; connected: number; links: number; nodes: Node[]; edges: [string, string][] }
type Pos = Record<string, { x: number; y: number }>

const W = 900, H = 560

// A small force layout: linked members pull together, everyone pushes apart. Runs once when the data loads.
function layout(nodes: Node[], edges: [string, string][]): Pos {
  const p: Pos = {}
  nodes.forEach((n, i) => { const a = (i / nodes.length) * Math.PI * 2; p[n.id] = { x: W / 2 + Math.cos(a) * 200, y: H / 2 + Math.sin(a) * 200 } })
  for (let it = 0; it < 220; it++) {
    const f: Pos = Object.fromEntries(nodes.map(n => [n.id, { x: 0, y: 0 }]))
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = p[nodes[i].id], b = p[nodes[j].id]
      const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(dx * dx + dy * dy, 25), k = 1800 / d2
      f[nodes[i].id].x += dx * k; f[nodes[i].id].y += dy * k; f[nodes[j].id].x -= dx * k; f[nodes[j].id].y -= dy * k
    }
    for (const [x, y] of edges) {
      const a = p[x], b = p[y], dx = b.x - a.x, dy = b.y - a.y, k = 0.02
      f[x].x += dx * k; f[x].y += dy * k; f[y].x -= dx * k; f[y].y -= dy * k
    }
    for (const n of nodes) {
      const q = p[n.id]; f[n.id].x += (W / 2 - q.x) * 0.01; f[n.id].y += (H / 2 - q.y) * 0.01
      q.x = Math.min(W - 20, Math.max(20, q.x + Math.max(-12, Math.min(12, f[n.id].x))))
      q.y = Math.min(H - 20, Math.max(20, q.y + Math.max(-12, Math.min(12, f[n.id].y))))
    }
  }
  return p
}

export default function Network() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.replace('/') }, [loading, user, isAdmin, router])
  useEffect(() => { if (user && isAdmin) apiGet<Data>('/api/admin/network').then(setD).catch(e => setErr(e.message)) }, [user, isAdmin])

  const pos = useMemo(() => (d ? layout(d.nodes, d.edges) : {}), [d])
  const names = useMemo(() => new Map((d?.nodes ?? []).map(n => [n.id, n])), [d])
  const match = (n: Node) => q.trim() && `${n.name} ${n.username}`.toLowerCase().includes(q.trim().toLowerCase())
  const near = useMemo(() => {
    const s = new Set<string>()
    if (pick && d) { s.add(pick); for (const [a, b] of d.edges) { if (a === pick) s.add(b); if (b === pick) s.add(a) } }
    return s
  }, [pick, d])
  const picked = pick ? names.get(pick) : null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <h1 className="font-display text-br-dk-text text-3xl tracking-[0.1em]">Friends web</h1>
      <p className="text-sm text-br-dk-sub">Members linked when each has the other&apos;s number saved. Members in Invisible mode are left out. Staff only.</p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {!d && !err && <p className="text-sm text-br-dk-sub">Loading…</p>}
      {d && (
        <>
          <div className="flex flex-wrap gap-6 text-sm text-br-dk-text">
            <span><b>{d.connected}</b> of {d.members} members have a friend here</span>
            <span><b>{d.links}</b> friend links</span>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a member" className="sk-field rounded-lg px-3 py-2 text-sm text-br-dk-text w-full max-w-xs" />
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-br-dk-border bg-br-dk-card" role="img" aria-label="Friends web">
            {d.edges.map(([a, b]) => (
              <line key={a + b} x1={pos[a]?.x} y1={pos[a]?.y} x2={pos[b]?.x} y2={pos[b]?.y}
                stroke="currentColor" className="text-br-dk-border" strokeOpacity={pick ? (near.has(a) && near.has(b) ? 1 : 0.1) : 0.6} />
            ))}
            {d.nodes.map(n => (
              <g key={n.id} onClick={() => setPick(pick === n.id ? null : n.id)} className="cursor-pointer" opacity={pick && !near.has(n.id) ? 0.25 : 1}>
                <circle cx={pos[n.id]?.x} cy={pos[n.id]?.y} r={5 + Math.min(n.friends, 12)}
                  fill={match(n) ? '#4ade80' : '#007A50'} stroke="#fff" strokeWidth={match(n) || pick === n.id ? 2 : 0.5} />
                {(match(n) || near.has(n.id) || n.friends >= 6) && (
                  <text x={pos[n.id]?.x} y={(pos[n.id]?.y ?? 0) - 10 - Math.min(n.friends, 12)} textAnchor="middle" fontSize="11" fill="currentColor" className="text-br-dk-text">{n.name}</text>
                )}
              </g>
            ))}
          </svg>
          {picked && <p className="text-sm text-br-dk-text"><b>{picked.name}</b> {picked.username && `(${picked.username})`} has {picked.friends} friend{picked.friends === 1 ? '' : 's'}: {[...near].filter(i => i !== pick).map(i => names.get(i)?.name).join(', ') || 'none shown'}</p>}
          <div>
            <h2 className="text-br-dk-text font-semibold mb-2">Most connected</h2>
            <ul className="text-sm text-br-dk-text divide-y divide-br-dk-border">
              {d.nodes.slice(0, 25).map(n => (
                <li key={n.id} className="py-1.5 flex justify-between"><button onClick={() => setPick(n.id)} className="text-left hover:underline">{n.name} <span className="text-br-dk-sub">{n.username}</span></button><span>{n.friends}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
