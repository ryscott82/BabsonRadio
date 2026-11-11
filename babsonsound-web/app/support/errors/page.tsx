import type { Metadata } from 'next'
import { ERROR_LIST } from '@/lib/errors'

export const metadata: Metadata = { title: 'Error codes — Babson Radio' }

const AREAS: Record<string, string> = {
  AUTH: 'Signing in', ACC: 'Accounts', GST: 'Guest access', NET: 'Contacts & friends',
  SLT: 'Air-time requests', PERM: 'Permissions', PRE: 'Before launch', AGE: 'Age and birthday', SET: 'Account setup', REQ: 'Requests', SRV: 'Server (station staff)', CLI: 'App & connection',
}

export default function ErrorKey() {
  const groups = Object.keys(AREAS).map(a => ({
    key: a, title: AREAS[a], items: ERROR_LIST.filter(e => e.code.startsWith(`BR-${a}-`)),
  })).filter(g => g.items.length)

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl tracking-widest mb-2">Error codes</h1>
      <p className="text-br-dk-sub text-lg mb-8">Find your code below, like <span className="text-br-dk-text">Br-acc-003</span>. Still stuck? Send us the code.</p>
      {groups.map(g => (
        <section key={g.key} className="mb-10">
          <h2 className="font-display tracking-widest text-br-gold text-sm mb-3">{g.title.toUpperCase()}</h2>
          <div className="space-y-3">
            {g.items.map(e => (
              <div key={e.code} id={e.code} className="sk-raised rounded-xl p-4">
                <p className="text-sm"><span className="font-mono text-br-gold mr-2">{e.code}</span>{e.title}</p>
                <p className="text-br-dk-sub text-sm mt-1">{e.meaning}</p>
                <p className="text-sm mt-2"><span className="text-br-dk-muted">Try: </span>{e.userFix}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
