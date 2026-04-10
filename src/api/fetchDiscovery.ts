import type { DiscoveredHost } from '../types'

function apiBase(): string | undefined {
  const v = import.meta.env.VITE_DISCOVERY_API_URL
  return typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\/$/, '') : undefined
}

/**
 * GET {VITE_DISCOVERY_API_URL}/hosts — expects JSON array of DiscoveredHost.
 * Configure in `.env`: VITE_DISCOVERY_API_URL=http://127.0.0.1:4000
 */
export async function fetchDiscoveryHosts(): Promise<DiscoveredHost[]> {
  const base = apiBase()
  if (!base) {
    throw new Error('NO_API_CONFIGURED')
  }

  const res = await fetch(`${base}/hosts`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Discovery API returned ${res.status}`)
  }

  const data: unknown = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('Discovery API JSON must be an array')
  }
  return data as DiscoveredHost[]
}

export function isApiConfigured(): boolean {
  return Boolean(apiBase())
}
