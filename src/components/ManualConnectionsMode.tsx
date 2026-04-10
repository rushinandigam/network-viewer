import { useCallback, useMemo, useState } from 'react'
import { HostCard } from './HostCard'
import type { DiscoveredHost } from '../types'
import {
  deleteManualConnection,
  loadManualConnections,
  upsertManualConnection,
} from '../lib/manualStorage'
import { manualToDiscoveredHost, probeHost, type ProbeResult } from '../lib/networkApi'

type Props = {
  onCopy: (text: string) => void
}

export function ManualConnectionsMode({ onCopy }: Props) {
  const [saved, setSaved] = useState(() => loadManualConnections())
  const [probeById, setProbeById] = useState<Record<string, ProbeResult | null>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [host, setHost] = useState('')
  const [tcpPort, setTcpPort] = useState('5001')
  const [wsPort, setWsPort] = useState('8080')
  const [udpPort, setUdpPort] = useState('6000')
  const [error, setError] = useState<string | null>(null)

  const hosts: DiscoveredHost[] = useMemo(
    () =>
      saved.map((c) =>
        manualToDiscoveredHost(c, probeById[c.id] ?? null),
      ),
    [saved, probeById],
  )

  const runProbe = useCallback(
    async (id: string, h: string, tcp: number, ws: number, udp: number) => {
      setLoadingId(id)
      setError(null)
      try {
        const r = await probeHost(h, tcp, ws, udp)
        setProbeById((m) => ({ ...m, [id]: r }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Probe failed'
        setError(msg)
        setProbeById((m) => ({ ...m, [id]: null }))
      } finally {
        setLoadingId(null)
      }
    },
    [],
  )

  const refreshList = useCallback(() => {
    setSaved(loadManualConnections())
  }, [])

  const addConnection = useCallback(() => {
    const h = host.trim()
    const tcp = Number(tcpPort) || 5001
    const ws = Number(wsPort) || 8080
    const udp = Number(udpPort) || 6000
    if (!h) {
      setError('Enter the desktop IP or hostname.')
      return
    }
    const nick = nickname.trim() || h
    const c = upsertManualConnection({
      nickname: nick,
      host: h,
      tcpPort: tcp,
      wsPort: ws,
      udpPort: udp,
    })
    refreshList()
    setFormOpen(false)
    setNickname('')
    setHost('')
    void runProbe(c.id, c.host, c.tcpPort, c.wsPort, c.udpPort)
  }, [host, tcpPort, wsPort, udpPort, nickname, refreshList, runProbe])

  const remove = useCallback(
    (id: string) => {
      deleteManualConnection(id)
      setProbeById((m) => {
        const n = { ...m }
        delete n[id]
        return n
      })
      refreshList()
    },
    [refreshList],
  )

  return (
    <div className="mode-panel">
      <p className="mode-panel__intro">
        Same idea as the mobile app: enter this machine’s LAN IP and ports, then probe TCP reachability.
        Default TCP is often <code>5001</code> on macOS (AirPlay uses 5000) or <code>5000</code> elsewhere.
      </p>

      <div className="mode-panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setFormOpen((v) => !v)}
        >
          {formOpen ? 'Close form' : 'Add desktop'}
        </button>
      </div>

      {formOpen ? (
        <div className="card card--form">
          <label className="field">
            <span>Nickname (optional)</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Living room PC"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Desktop IP</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.42"
              autoComplete="off"
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>TCP</span>
              <input
                value={tcpPort}
                onChange={(e) => setTcpPort(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>WebSocket</span>
              <input
                value={wsPort}
                onChange={(e) => setWsPort(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>UDP</span>
              <input
                value={udpPort}
                onChange={(e) => setUdpPort(e.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => void addConnection()}>
            Save &amp; probe
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {saved.length > 0 ? (
        <section className="saved-block">
          <h2 className="saved-block__title">Saved desktops</h2>
          <ul className="saved-list">
            {saved.map((c) => (
              <li key={c.id} className="saved-list__item">
                <div className="saved-list__meta">
                  <strong>{c.nickname}</strong>
                  <span className="saved-list__host">
                    {c.host} · TCP {c.tcpPort}
                  </span>
                </div>
                <div className="saved-list__btns">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={loadingId === c.id}
                    onClick={() =>
                      void runProbe(c.id, c.host, c.tcpPort, c.wsPort, c.udpPort)
                    }
                  >
                    {loadingId === c.id ? 'Probing…' : 'Probe'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    onClick={() => remove(c.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="empty-hint">No saved desktops yet. Add one above.</p>
      )}

      <div className="host-grid">
        {hosts.map((h) => (
          <HostCard key={h.id} host={h} onCopy={onCopy} />
        ))}
      </div>
    </div>
  )
}
