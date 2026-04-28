export type BitcoinNode = {
  id: string
  lat: number
  lon: number
  country: string
  city: string
  kind: 'ipv4' | 'ipv6'
  agent: string
  since: number
  services: number
  height: number
}

export type NodeDataset = {
  source: string
  generatedAt: string
  snapshotTimestamp: number
  latestHeight: number
  totals: {
    reachable: number
    geolocated: number
    tor: number
    i2p: number
    ipv4: number
    ipv6: number
    unknown: number
  }
  topCountries: Array<{
    country: string
    count: number
  }>
  nodes: BitcoinNode[]
}

