/**
 * Mobile Mouse web bridge: WebSocket (browser) <-> raw TCP (Java desktop).
 * WebSocket proxy for JPEG screen stream (browser <-> desktop WS).
 */
import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import net from 'node:net'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT || 4000)

const app = express()
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mobile-mouse-bridge', version: 1 })
})

const server = createServer(app)

const wssTcp = new WebSocketServer({ noServer: true })
const wssStream = new WebSocketServer({ noServer: true })

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} host
 * @param {number} port
 */
function attachTcpBridge(ws, host, port) {
  let tcp = null
  let buf = ''

  const cleanup = () => {
    try {
      tcp?.removeAllListeners()
      if (tcp && !tcp.destroyed) tcp.destroy()
    } catch {
      /* ignore */
    }
    tcp = null
  }

  tcp = net.createConnection({ host, port }, () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected', host, port }))
    }
  })

  tcp.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (line.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(line)
      }
    }
  })

  tcp.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }))
    }
    cleanup()
    try {
      ws.close()
    } catch {
      /* ignore */
    }
  })

  tcp.on('close', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tcp_closed' }))
    }
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    cleanup()
  })

  ws.on('message', (data, isBinary) => {
    if (isBinary || !tcp || tcp.destroyed) return
    const text =
      typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf8') : ''
    const line = text.endsWith('\n') ? text : `${text}\n`
    tcp.write(line, 'utf8')
  })

  ws.on('close', () => {
    cleanup()
  })

  ws.on('error', () => {
    cleanup()
  })
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {import('http').IncomingMessage} req
 */
function attachStreamProxy(ws, req) {
  const u = new URL(req.url || '/', 'http://localhost')
  const host = u.searchParams.get('host')?.trim() || ''
  const port = Number(u.searchParams.get('port') || 8080)
  if (!host) {
    ws.close(4000, 'missing host')
    return
  }

  const target = `ws://${host}:${port}/`
  const upstream = new WebSocket(target)

  upstream.on('open', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stream_connected', host, port }))
    }
  })

  upstream.on('message', (data, isBinary) => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(data, { binary: Boolean(isBinary) })
  })

  upstream.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stream_error', message: err.message }))
    }
    try {
      ws.close()
    } catch {
      /* ignore */
    }
  })

  upstream.on('close', () => {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
  })

  ws.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data)
    }
  })

  ws.on('close', () => {
    try {
      upstream.close()
    } catch {
      /* ignore */
    }
  })
}

server.on('upgrade', (request, socket, head) => {
  const u = new URL(request.url || '/', 'http://localhost')
  if (u.pathname === '/ws/tcp') {
    const host = u.searchParams.get('host')?.trim() || ''
    const port = Number(u.searchParams.get('port') || 0)
    if (!host || !port) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wssTcp.handleUpgrade(request, socket, head, (ws) => {
      attachTcpBridge(ws, host, port)
    })
  } else if (u.pathname === '/ws/stream') {
    wssStream.handleUpgrade(request, socket, head, (ws) => {
      attachStreamProxy(ws, request)
    })
  } else {
    socket.destroy()
  }
})

server.listen(PORT, () => {
  console.log(`[bridge] http://127.0.0.1:${PORT}  WebSocket /ws/tcp  /ws/stream`)
})
