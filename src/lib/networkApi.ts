import type { DiscoveredHost } from '../types'
import type { ManualConnection } from './manualStorage'

export type ProbeResult = {
  tcp: boolean
  webSocket: boolean
  udp: boolean | null
  udpPort: number
}

export async function probeHost(
  host: string,
  tcpPort: number,
  wsPort: number,
  udpPort: number,
): Promise<ProbeResult> {
  const q = new URLSearchParams({
    host,
    tcp: String(tcpPort),
    ws: String(wsPort),
    udp: String(udpPort),
  })
  const res = await fetch(`/api/probe?${q}`)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Probe failed (${res.status})`)
  }
  return res.json() as Promise<ProbeResult>
}

export function manualToDiscoveredHost(
  c: ManualConnection,
  probe: ProbeResult | null,
): DiscoveredHost {
  return {
    id: c.id,
    ip: c.host,
    displayName: c.nickname || c.host,
    ports: {
      tcpControl: { port: c.tcpPort, open: probe?.tcp ?? null, label: 'TCP control' },
      webSocketStream: {
        port: c.wsPort,
        open: probe?.webSocket ?? null,
        label: 'WebSocket stream',
      },
      udpStream: {
        port: c.udpPort,
        open: probe?.udp ?? null,
        label: 'UDP stream',
      },
    },
    lastSeen: c.lastUsed,
  }
}

export type LocalSocketRow = {
  command: string
  pid: string
  port: number
  kind: 'listen' | 'established' | 'other'
  localAddr?: string
  remoteAddr?: string
  detail: string
}

export type LocalSocketsResponse = {
  interfaces: { name: string; address: string; internal: boolean }[]
  sockets: LocalSocketRow[]
}

export async function fetchLocalSockets(): Promise<LocalSocketsResponse> {
  const res = await fetch('/api/local-sockets')
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Local sockets failed (${res.status})`)
  }
  return res.json() as Promise<LocalSocketsResponse>
}

export async function scanLan(subnet: string, port: number): Promise<string[]> {
  const q = new URLSearchParams({ subnet, port: String(port) })
  const res = await fetch(`/api/lan-scan?${q}`)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Scan failed (${res.status})`)
  }
  const data = (await res.json()) as { hosts: string[] }
  return data.hosts
}

export function apiAvailable(): boolean {
  return import.meta.env.DEV
}
