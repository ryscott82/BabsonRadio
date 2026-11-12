'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch } from '@/lib/auth'
import type { SettingValue } from '@/lib/settingRow'
import type { ServerSetting } from '@/lib/settingsDefs'

interface Reply { settings: ServerSetting[] }

/** The one-call settings endpoint for a page that shows some of the settings: one read when the page opens, and each save is one PATCH that returns the whole list. */
export function useServerSettings(enabled: boolean) {
  const [list, setList] = useState<ServerSetting[] | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0) // bumps after each save
  const load = useCallback(async () => {
    setError('')
    try { setList((await apiGet<Reply>('/api/admin/settings')).settings) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the settings.') }
  }, [])
  useEffect(() => { if (enabled) queueMicrotask(load) }, [enabled, load])
  /** `changes`: key -> value, or null for Reset. Throws the server's message when it refuses. */
  const patch = useCallback(async (changes: Record<string, SettingValue | null>) => {
    const r = await apiPatch<Reply>('/api/admin/settings', { changes })
    setList(r.settings); setVersion(v => v + 1)
  }, [])
  return { list, error, version, reload: load, patch }
}
