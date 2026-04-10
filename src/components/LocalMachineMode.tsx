import { useCallback, useEffect, useState } from 'react'
import { fetchLocalSockets, scanLan, type LocalSocketRow } from '../lib/networkApi'

function socketKindLabel(k: LocalSocketRow['kind']) {
  if (k === 'listen') return 'Listening'
  if (k === 'established') return 'Established'
  return 'Other'
}

export function LocalMachineMode() {
  const [ifaces, setIfaces] = useState<{ name: string; address: string; internal: boolean }[]>(
    [],
  )
  const [sockets, setSockets] = useState<LocalSocketRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subnet, setSubnet] = useState('')
  const [scanPort, setScanPort] = useState('5001')
  const [scanning, setScanning] = useState(false)
  const [foundHosts, setFoundHosts] = useState<string[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLocalSockets()
      setIfaces(data.interfaces)
      setSockets(data.sockets)
      setSubnet((prev) => {
        if (prev || data.interfaces.length === 0) return prev
        const pick =
          data.interfaces.find((i) => !i.internal && i.address.startsWith('192.168.')) ??
          data.interfaces.find((i) => !i.internal) ??
          data.interfaces[0]
        const parts = pick.address.split('.')
        if (parts.length === 4) {
          return `${parts[0]}.${parts[1]}.${parts[2]}`
        }
        return prev
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read local sockets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runScan = useCallback(async () => {
    const s = subnet.trim()
    const p = Number(scanPort) || 5001
    if (!s) {
      setError('Enter subnet prefix (e.g. 192.168.1).')
      return
    }
    setScanning(true)
    setError(null)
    setFoundHosts([])
    try {
      const hosts = await scanLan(s, p)
      setFoundHosts(hosts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }, [subnet, scanPort])

  return (
    <div className="mode-panel">
      <p className="mode-panel__intro">
        Shows this computer’s IPv4 addresses and TCP sockets on ports 5000, 5001, 6000, and 8080
        (listeners and established peers — e.g. your phone connected to the desktop app). Works only
        when you run <code>pnpm dev</code> on the same machine as the Java server.
      </p>

      <div className="mode-panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh local data'}
        </button>
      </div>

      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="local-section">
        <h2 className="local-section__title">Network interfaces</h2>
        {ifaces.length === 0 && !loading ? (
          <p className="empty-hint">No IPv4 interfaces reported.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {ifaces.map((i) => (
                  <tr key={`${i.name}-${i.address}`}>
                    <td>{i.name}</td>
                    <td>
                      <code>{i.address}</code>
                    </td>
                    <td>{i.internal ? 'Loopback / internal' : 'LAN'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="local-section">
        <h2 className="local-section__title">Mobile Mouse–related TCP sockets</h2>
        {sockets.length === 0 && !loading ? (
          <p className="empty-hint">
            No listeners or connections on 5000/5001/6000/8080. Start the desktop app or connect
            from the phone, then refresh.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>PID</th>
                  <th>Port</th>
                  <th>Kind</th>
                  <th>Local</th>
                  <th>Remote</th>
                </tr>
              </thead>
              <tbody>
                {sockets.map((s, idx) => (
                  <tr key={`${s.port}-${s.detail}-${idx}`}>
                    <td>{s.command}</td>
                    <td>{s.pid || '—'}</td>
                    <td>
                      <code>{s.port}</code>
                    </td>
                    <td>{socketKindLabel(s.kind)}</td>
                    <td>
                      <code>{s.localAddr ?? '—'}</code>
                    </td>
                    <td>
                      <code>{s.remoteAddr ?? '—'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="local-section">
        <h2 className="local-section__title">Scan LAN for open TCP control port</h2>
        <p className="mode-panel__intro">
          Probes <code>.1</code>–<code>.254</code> on the subnet for a reachable TCP port (same host
          where you run this dev server). Use the subnet of your Wi‑Fi (first three octets).
        </p>
        <div className="scan-row">
          <label className="field field--inline">
            <span>Subnet</span>
            <input
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.1"
            />
          </label>
          <label className="field field--inline">
            <span>TCP port</span>
            <input
              value={scanPort}
              onChange={(e) => setScanPort(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={scanning}
            onClick={() => void runScan()}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>
        {foundHosts.length > 0 ? (
          <ul className="found-hosts">
            {foundHosts.map((h) => (
              <li key={h}>
                <code>{h}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
