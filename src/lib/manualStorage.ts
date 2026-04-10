export type ManualConnection = {
  id: string
  nickname: string
  host: string
  tcpPort: number
  wsPort: number
  udpPort: number
  lastUsed: string
}

const KEY = 'network-viewer.manualConnections.v1'

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadManualConnections(): ManualConnection[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is ManualConnection =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as ManualConnection).host === 'string' &&
        typeof (x as ManualConnection).id === 'string',
    )
  } catch {
    return []
  }
}

export function saveManualConnections(list: ManualConnection[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function upsertManualConnection(entry: Omit<ManualConnection, 'id' | 'lastUsed'> & { id?: string }) {
  const list = loadManualConnections()
  const now = new Date().toISOString()
  const id = entry.id ?? uid()
  const next: ManualConnection = {
    id,
    nickname: entry.nickname,
    host: entry.host,
    tcpPort: entry.tcpPort,
    wsPort: entry.wsPort,
    udpPort: entry.udpPort,
    lastUsed: now,
  }
  const i = list.findIndex((c) => c.id === id)
  if (i >= 0) list[i] = next
  else list.unshift(next)
  list.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
  saveManualConnections(list)
  return next
}

export function deleteManualConnection(id: string) {
  saveManualConnections(loadManualConnections().filter((c) => c.id !== id))
}
