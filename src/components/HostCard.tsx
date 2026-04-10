import type { DiscoveredHost } from '../types'

type Props = {
  host: DiscoveredHost
  onCopy: (text: string) => void
}

function PortBadge({
  open,
  label,
}: {
  open: boolean | null
  label: string
}) {
  if (open === null) {
    return (
      <span className="port-badge port-badge--unknown" title={label}>
        —
      </span>
    )
  }
  return (
    <span
      className={
        open ? 'port-badge port-badge--open' : 'port-badge port-badge--closed'
      }
      title={label}
    >
      {open ? 'open' : 'closed'}
    </span>
  )
}

export function HostCard({ host, onCopy }: Props) {
  const { tcpControl, webSocketStream, udpStream } = host.ports
  const controlAddr = `${host.ip}:${tcpControl.port}`
  const wsUrl = `ws://${host.ip}:${webSocketStream.port}/`
  const httpProbe = `http://${host.ip}:${webSocketStream.port}/`

  return (
    <article className="host-card">
      <div className="host-card__head">
        <div>
          <h2 className="host-card__title">{host.displayName}</h2>
          <p className="host-card__ip">{host.ip}</p>
        </div>
        <time className="host-card__time" dateTime={host.lastSeen}>
          {new Date(host.lastSeen).toLocaleString()}
        </time>
      </div>

      <ul className="host-card__ports">
        <li>
          <span className="port-name">{tcpControl.label}</span>
          <code className="port-num">{tcpControl.port}</code>
          <PortBadge open={tcpControl.open} label={tcpControl.label} />
        </li>
        <li>
          <span className="port-name">{webSocketStream.label}</span>
          <code className="port-num">{webSocketStream.port}</code>
          <PortBadge open={webSocketStream.open} label={webSocketStream.label} />
        </li>
        <li>
          <span className="port-name">{udpStream.label}</span>
          <code className="port-num">{udpStream.port}</code>
          <PortBadge open={udpStream.open} label={udpStream.label} />
        </li>
      </ul>

      <div className="host-card__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onCopy(controlAddr)}
        >
          Copy TCP {tcpControl.port}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => onCopy(wsUrl)}>
          Copy WebSocket URL
        </button>
        <a
          className="btn btn--primary"
          href={httpProbe}
          target="_blank"
          rel="noreferrer"
        >
          Try in browser
        </a>
      </div>
      <p className="host-card__hint">
        “Try in browser” only works if the desktop app exposes HTTP on that port;
        your Java server may be WebSocket-only — use the mobile app for TCP{' '}
        {tcpControl.port}.
      </p>
    </article>
  )
}
