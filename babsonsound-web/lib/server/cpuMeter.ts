import 'server-only'
import { createCpuMeter, type CpuMinute } from '../cpuMeterCore'
import { routeName } from './readMeter'

// Per-route server time, next to the Firestore read meter. See lib/cpuMeterCore.ts for how the time is split.
// Never reads or writes Firestore. Turn off with CPU_METER=0.

const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }

const meter = createCpuMeter({
  cpu: cpuMs,
  log: l => console.log(l),
  instance: (process.env.VERCEL_DEPLOYMENT_ID ?? 'local').slice(-6) + '/' + Math.random().toString(16).slice(2, 6),
})

/** Called by handle() around every API request (inside the read meter's wrapper, so the route name is known). */
export function cpuMeterRequest<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.CPU_METER === '0') return fn()
  return meter.track(routeName, fn)
}

export const cpuMeterSnapshot = (): CpuMinute[] => meter.snapshot()
