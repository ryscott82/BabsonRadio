import type { Overview } from '@/lib/server/serverUsage'

// Which routes use the most server time on the server instance that answered, for the last hour (kept from the earlier page).
export default function RouteTable({ d }: { d: Overview }) {
  const r = d.routes
  const total = r.totals.reduce((a, x) => a + x.cpuMs, 0)
  const per = r.minutes.slice(0, 15)
  const max = Math.max(1, ...per.map(m => m.totalCpuMs))
  const asked = r.tokenCache.hits + r.tokenCache.misses
  return (
    <details className="ops-card p-4">
      <summary className="cursor-pointer text-xl min-h-[44px] flex items-center">This server, last hour: by route</summary>
      <div className="space-y-4 pt-3">
        <p className="opacity-90">{r.note} The bill itself is on Vercel: Usage, Fluid Active CPU, by route.</p>
        <div className="overflow-x-auto">
          <p className="mb-2">By route ({(total / 1000).toFixed(1)} s of server time in all)</p>
          <table className="w-full min-w-[640px]">
            <thead><tr className="text-left border-b border-white/25"><th className="font-normal py-1">Route</th><th className="font-normal text-right">Calls</th><th className="font-normal text-right">Server time (s)</th><th className="font-normal text-right">Share</th><th className="font-normal text-right">Avg per call (ms)</th><th className="font-normal text-right">Worst (ms)</th><th className="font-normal text-right">Reads</th></tr></thead>
            <tbody>
              {r.totals.map(x => (
                <tr key={x.route}><td className="break-all py-0.5">{x.route}</td><td className="text-right tabular-nums">{x.requests}</td><td className="text-right tabular-nums">{(x.cpuMs / 1000).toFixed(2)}</td><td className="text-right tabular-nums">{total ? Math.round((x.cpuMs / total) * 100) : 0}%</td><td className="text-right tabular-nums">{x.avgCpuMs}</td><td className="text-right tabular-nums">{x.maxCpuMs}</td><td className="text-right tabular-nums">{x.reads}</td></tr>
              ))}
              {r.totals.length === 0 && <tr><td colSpan={7} className="py-2">Nothing has run on this server instance in the last hour.</td></tr>}
            </tbody>
          </table>
        </div>
        {per.length > 0 && (
          <div className="space-y-1">
            <p>Server time per minute, newest first (ms)</p>
            {per.map(m => (
              <div key={m.minute} className="flex items-center gap-3">
                <span className="w-28 tabular-nums shrink-0">{m.minute.slice(11)} UTC</span>
                <div className="h-2 rounded-full bg-black/35 overflow-hidden flex-1"><div className="h-full bg-white" style={{ width: `${(m.totalCpuMs / max) * 100}%` }} /></div>
                <span className="w-16 text-right tabular-nums">{Math.round(m.totalCpuMs)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-sm opacity-90">Sign-in checks remembered by this instance: {r.tokenCache.hits} of {asked} calls{asked ? ` (${Math.round((r.tokenCache.hits / asked) * 100)}%)` : ''} skipped the signature check. Calls that Vercel answers from its cache never reach a server, so they are not counted here.</p>
      </div>
    </details>
  )
}
