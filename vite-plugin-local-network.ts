import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'

const execFileAsync = promisify(execFile)

/** Ports used by Mobile Mouse desktop (control / stream). */
const TRACK_PORTS = new Set([5000, 5001, 6000, 8080])

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.once('timeout', () => done(false))
  })
}

function parseLsofTcpRest(rest: string): {
  kind: 'listen' | 'established' | 'other'
  summary: string
  localAddr?: string
  remoteAddr?: string
} {
  const listen = rest.match(
    /^(\*|(?:\[[0-9a-fA-F:.]+\])|(?:[0-9.]+)):(\d+) \(LISTEN\)/,
  )
  if (listen) {
    return {
      kind: 'listen',
      summary: rest,
      localAddr: `${listen[1]}:${listen[2]}`,
    }
  }
  const est = rest.match(
    /^(\*|(?:\[[0-9a-fA-F:.]+\])|(?:[0-9.]+)):(\d+)->(\*|(?:\[[0-9a-fA-F:.]+\])|(?:[0-9.]+)):(\d+) \(ESTABLISHED\)/,
  )
  if (est) {
    return {
      kind: 'established',
      summary: rest,
      localAddr: `${est[1]}:${est[2]}`,
      remoteAddr: `${est[3]}:${est[4]}`,
    }
  }
  return { kind: 'other', summary: rest }
}

function portFromLsofName(rest: string): number | null {
  const m = rest.match(/:(\d+) \(LISTEN\)/)
  if (m) return Number(m[1])
  const e = rest.match(/:(\d+)->.+\(ESTABLISHED\)/)
  if (e) return Number(e[1])
  return null
}

async function lsofRows(): Promise<
  { command: string; pid: string; socketText: string; port: number | null }[]
> {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      '-iTCP',
      '-sTCP:LISTEN,ESTABLISHED',
    ])
    const lines = stdout.split('\n').filter(Boolean)
    const header = lines[0]?.startsWith('COMMAND') ? lines.slice(1) : lines
    const rows: { command: string; pid: string; socketText: string; port: number | null }[] =
      []
    for (const line of header) {
      const tcpIdx = line.indexOf(' TCP ')
      if (tcpIdx < 0) continue
      const parts = line.slice(0, tcpIdx).trim().split(/\s+/)
      const command = parts[0] ?? ''
      const pid = parts[1] ?? ''
      const socketText = line.slice(tcpIdx + 1).trim()
      const port = portFromLsofName(socketText.replace(/^TCP\s+/, ''))
      rows.push({ command, pid, socketText, port })
    }
    return rows
  } catch {
    return []
  }
}

async function netstatRowsWindows(): Promise<
  { command: string; pid: string; socketText: string; port: number | null }[]
> {
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'])
    const rows: { command: string; pid: string; socketText: string; port: number | null }[] =
      []
    for (const line of stdout.split('\n')) {
      const m = line.match(
        /^\s*TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+(\w+)\s+(\d+)/i,
      )
      if (!m) continue
      const localPort = Number(m[2])
      const state = m[5]
      if (state !== 'LISTENING' && state !== 'ESTABLISHED') continue
      const socketText =
        state === 'LISTENING'
          ? `${m[1]}:${m[2]} (LISTEN)`
          : `${m[1]}:${m[2]}->${m[3]}:${m[4]} (ESTABLISHED)`
      rows.push({
        command: 'tcp',
        pid: m[6] ?? '',
        socketText: `TCP ${socketText}`,
        port: localPort,
      })
    }
    return rows
  } catch {
    return []
  }
}

async function getSocketRows() {
  if (process.platform === 'win32') {
    return netstatRowsWindows()
  }
  return lsofRows()
}

function networkInterfacesPayload() {
  const ifs = os.networkInterfaces()
  const list: { name: string; address: string; internal: boolean }[] = []
  for (const [name, addrs] of Object.entries(ifs)) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family === 'IPv4') {
        list.push({ name, address: a.address, internal: a.internal })
      }
    }
  }
  return list
}

function createMiddleware() {
  return async function apiMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const url = req.url
    if (!url?.startsWith('/api/')) {
      next()
      return
    }

    try {
      const u = new URL(url, 'http://127.0.0.1')

      if (u.pathname === '/api/probe' && req.method === 'GET') {
        const host = (u.searchParams.get('host') ?? '').trim()
        const tcp = Number(u.searchParams.get('tcp') ?? '5001') || 5001
        const ws = Number(u.searchParams.get('ws') ?? '8080') || 8080
        const udp = Number(u.searchParams.get('udp') ?? '6000') || 6000
        if (!host || host.length > 253 || /[\s/]/.test(host)) {
          json(res, 400, { error: 'Invalid host' })
          return
        }
        const [tcpOpen, wsOpen] = await Promise.all([
          probeTcp(host, tcp, 2800),
          probeTcp(host, ws, 2800),
        ])
        json(res, 200, {
          tcp: tcpOpen,
          webSocket: wsOpen,
          /** UDP cannot be reliably probed without app-specific packets */
          udp: null as boolean | null,
          udpPort: udp,
        })
        return
      }

      if (u.pathname === '/api/local-sockets' && req.method === 'GET') {
        const raw = await getSocketRows()
        const relevant = raw.filter((r) => r.port != null && TRACK_PORTS.has(r.port))
        const enriched = relevant.map((r) => {
          const st = r.socketText.replace(/^TCP\s+/, '')
          const parsed = parseLsofTcpRest(st)
          return {
            command: r.command,
            pid: r.pid,
            port: r.port,
            kind: parsed.kind,
            localAddr: parsed.localAddr,
            remoteAddr: parsed.remoteAddr,
            detail: parsed.summary,
          }
        })
        json(res, 200, {
          interfaces: networkInterfacesPayload(),
          sockets: enriched,
        })
        return
      }

      if (u.pathname === '/api/lan-scan' && req.method === 'GET') {
        const subnet = (u.searchParams.get('subnet') ?? '').trim()
        const port = Number(u.searchParams.get('port') ?? '5001') || 5001
        const m = subnet.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
        if (!m) {
          json(res, 400, { error: 'subnet must look like 192.168.1 (first three octets)' })
          return
        }
        const a = Number(m[1])
        const b = Number(m[2])
        const c = Number(m[3])
        if (a > 255 || b > 255 || c > 255) {
          json(res, 400, { error: 'Invalid subnet' })
          return
        }
        const base = `${a}.${b}.${c}`
        const found: string[] = []
        const hostNums = Array.from({ length: 254 }, (_, i) => i + 1)
        const concurrency = 48
        let nextIdx = 0
        async function worker() {
          while (true) {
            const idx = nextIdx++
            if (idx >= hostNums.length) break
            const hostNum = hostNums[idx]
            const host = `${base}.${hostNum}`
            const ok = await probeTcp(host, port, 220)
            if (ok) found.push(host)
          }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()))
        found.sort((x, y) =>
          x.localeCompare(y, undefined, { numeric: true }),
        )
        json(res, 200, { port, hosts: found })
        return
      }

      json(res, 404, { error: 'Not found' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error'
      json(res, 500, { error: msg })
    }
  }
}

export function localNetworkPlugin(): Plugin {
  const mw = createMiddleware()
  return {
    name: 'local-network-probe',
    configureServer(server) {
      server.middlewares.use(mw)
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw)
    },
  }
}
