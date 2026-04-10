/** Matches the JSON shape a future discovery backend can return. */

export type PortProbe = {
  port: number
  /** Whether the port accepted a TCP connection; UDP may stay null when unknown */
  open: boolean | null
  label: string
}

export type DiscoveredHost = {
  id: string
  ip: string
  displayName: string
  ports: {
    tcpControl: PortProbe
    webSocketStream: PortProbe
    udpStream: PortProbe
  }
  lastSeen: string
}
