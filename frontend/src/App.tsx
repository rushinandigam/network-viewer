import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

/** Maps pointer movement to gyro-style units (desktop server uses ~10 px per unit with default sensitivity). */
const MOVE_SCALE = 0.0035

type Status = { kind: 'idle' | 'connecting' | 'ready' | 'error'; message?: string }

export default function App() {
  const [host, setHost] = useState('127.0.0.1')
  const [tcpPort, setTcpPort] = useState('5001')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [typeText, setTypeText] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const pendingMove = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)

  const bridgeWsUrl = useCallback(() => {
    const q = new URLSearchParams({ host, port: tcpPort })
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/tcp?${q}`
  }, [host, tcpPort])

  const sendTcpJson = useCallback((obj: object) => {
    const w = wsRef.current
    if (!w || w.readyState !== WebSocket.OPEN) return
    w.send(JSON.stringify(obj))
  }, [])

  const flushMotion = useCallback(() => {
    rafRef.current = 0
    const w = wsRef.current
    if (!w || w.readyState !== WebSocket.OPEN) return
    const { x, y } = pendingMove.current
    pendingMove.current = { x: 0, y: 0 }
    if (x === 0 && y === 0) return
    const gx = clamp(x * MOVE_SCALE, -1, 1)
    const gy = clamp(y * MOVE_SCALE, -1, 1)
    w.send(
      JSON.stringify({
        gyroX: gx,
        gyroY: gy,
        leftClick: false,
        rightClick: false,
      }),
    )
  }, [])

  const queueMotion = useCallback(
    (dx: number, dy: number) => {
      pendingMove.current.x += dx
      pendingMove.current.y += dy
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(flushMotion)
    },
    [flushMotion],
  )

  const disconnect = useCallback(() => {
    try {
      wsRef.current?.close()
    } catch {
      /* ignore */
    }
    wsRef.current = null
    setStatus({ kind: 'idle' })
  }, [])

  const connect = useCallback(() => {
    disconnect()
    setStatus({ kind: 'connecting' })
    const ws = new WebSocket(bridgeWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setStatus({ kind: 'connecting', message: 'TCP bridge opening…' })
    }

    ws.onmessage = (ev) => {
      const t = typeof ev.data === 'string' ? ev.data : ''
      if (t.startsWith('{')) {
        try {
          const o = JSON.parse(t) as { type?: string; message?: string }
          if (o.type === 'connected') {
            setStatus({ kind: 'ready', message: `Linked to ${host}:${tcpPort}` })
          }
          if (o.type === 'error') {
            setStatus({ kind: 'error', message: o.message ?? 'Bridge error' })
          }
          if (o.type === 'tcp_closed') {
            setStatus({ kind: 'error', message: 'Desktop closed the TCP connection' })
          }
        } catch {
          /* ignore non-JSON */
        }
      }
    }

    ws.onerror = () => {
      setStatus({ kind: 'error', message: 'WebSocket error (is the bridge running on :4000?)' })
    }

    ws.onclose = () => {
      wsRef.current = null
      setStatus((s) => (s.kind === 'error' ? s : { kind: 'idle' }))
    }
  }, [bridgeWsUrl, disconnect, host, tcpPort])

  const click = useCallback(
    (left: boolean) => {
      sendTcpJson({
        gyroX: 0,
        gyroY: 0,
        leftClick: left,
        rightClick: !left,
      })
      window.setTimeout(() => {
        sendTcpJson({ gyroX: 0, gyroY: 0, leftClick: false, rightClick: false })
      }, 30)
    },
    [sendTcpJson],
  )

  const sendTypedText = useCallback(() => {
    const text = typeText
    if (!text) return
    sendTcpJson({ keyboard: { cmd: 'type', text } })
    setTypeText('')
  }, [typeText, sendTcpJson])

  useEffect(() => () => disconnect(), [disconnect])

  const padActive = status.kind === 'ready'

  return (
    <div className="control-app">
      <header className="control-app__header">
        <h1>Mobile Mouse (web)</h1>
        <p className="control-app__sub">
          Bridge on port 4000 forwards this page to the Java TCP server. Run the desktop app first,
          then connect.
        </p>
      </header>

      <section className="panel">
        <h2>Connection</h2>
        <div className="row">
          <label>
            Desktop host
            <input
              value={host}
              onChange={(e) => setHost(e.target.value.trim())}
              placeholder="127.0.0.1 or LAN IP"
              autoComplete="off"
            />
          </label>
          <label>
            TCP port
            <input
              value={tcpPort}
              onChange={(e) => setTcpPort(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
        <div className="row row--btns">
          <button type="button" className="btn primary" onClick={() => void connect()}>
            Connect
          </button>
          <button type="button" className="btn" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
        <p className={`status status--${status.kind}`}>
          {status.kind === 'idle' && 'Not connected'}
          {status.kind === 'connecting' && (status.message ?? 'Connecting…')}
          {status.kind === 'ready' && (status.message ?? 'Connected')}
          {status.kind === 'error' && (status.message ?? 'Error')}
        </p>
      </section>

      <section className="panel">
        <h2>Trackpad</h2>
        <p className="hint">Drag on the pad with pointer down to move the cursor (same JSON as the mobile app).</p>
        <div
          className={`trackpad ${padActive ? 'trackpad--on' : ''}`}
          onPointerMove={(e) => {
            if (!padActive || e.buttons === 0) return
            queueMotion(e.movementX, e.movementY)
          }}
          onPointerDown={(e) => {
            if (!padActive) return
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
        >
          {padActive ? 'Drag to move' : 'Connect first'}
        </div>
        <div className="row row--btns">
          <button
            type="button"
            className="btn"
            onClick={() => click(true)}
            disabled={!padActive}
          >
            Left click
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => click(false)}
            disabled={!padActive}
          >
            Right click
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Keyboard</h2>
        <div className="row">
          <input
            className="grow"
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sendTypedText()
              }
            }}
            placeholder="Type text to send to the desktop"
          />
          <button type="button" className="btn primary" onClick={() => sendTypedText()} disabled={!padActive}>
            Send
          </button>
        </div>
      </section>
    </div>
  )
}
