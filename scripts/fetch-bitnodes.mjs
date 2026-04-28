import fs from 'node:fs/promises'
import path from 'node:path'
import geoip from 'geoip-lite'

const SNAPSHOT_URL = 'https://bitnodes.io/api/v1/snapshots/latest/'
const outputPath = path.resolve('public/data/bitcoin-nodes.json')
const forceRefresh = process.argv.includes('--force')
const ttlHours = Number.parseFloat(process.env.BITNODES_CACHE_TTL_HOURS ?? '24')
const ttlMs = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours * 60 * 60 * 1000 : 24 * 60 * 60 * 1000

async function readCachedPayload() {
  try {
    const raw = await fs.readFile(outputPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cacheAgeMs(payload) {
  const generatedAt = Date.parse(payload?.generatedAt)
  if (!Number.isFinite(generatedAt)) return Number.POSITIVE_INFINITY
  return Date.now() - generatedAt
}

function formatAge(ms) {
  if (!Number.isFinite(ms)) return 'unknown age'
  const hours = ms / 1000 / 60 / 60
  return `${hours.toFixed(1)}h old`
}

function parseHost(nodeAddress) {
  if (nodeAddress.startsWith('[')) {
    const end = nodeAddress.indexOf(']')
    return end > 0 ? nodeAddress.slice(1, end) : null
  }

  const lastColon = nodeAddress.lastIndexOf(':')
  if (lastColon === -1) return null
  return nodeAddress.slice(0, lastColon)
}

function addressKind(host) {
  if (!host) return 'unknown'
  if (host.endsWith('.onion')) return 'tor'
  if (host.endsWith('.i2p')) return 'i2p'
  if (host.includes(':')) return 'ipv6'
  return 'ipv4'
}

function summarizeCountries(nodes) {
  const counts = new Map()
  for (const node of nodes) {
    if (!node.country) continue
    counts.set(node.country, (counts.get(node.country) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

async function main() {
  const cachedPayload = await readCachedPayload()
  const cachedAge = cacheAgeMs(cachedPayload)

  if (!forceRefresh && cachedPayload && cachedAge < ttlMs) {
    console.log(
      `Using cached Bitnodes data at ${outputPath} (${formatAge(cachedAge)}, TTL ${ttlHours}h).`,
    )
    console.log('Run `npm run data:refresh` to force a new Bitnodes request.')
    return
  }

  const response = await fetch(SNAPSHOT_URL, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    if (cachedPayload) {
      console.warn(
        `Bitnodes snapshot failed: ${response.status} ${response.statusText}. Reusing cached ${outputPath} (${formatAge(cachedAge)}).`,
      )
      return
    }
    throw new Error(`Bitnodes snapshot failed: ${response.status} ${response.statusText}`)
  }

  const snapshot = await response.json()
  const nodes = []
  const totals = {
    reachable: Object.keys(snapshot.nodes).length,
    geolocated: 0,
    tor: 0,
    i2p: 0,
    ipv4: 0,
    ipv6: 0,
    unknown: 0,
  }

  for (const [nodeAddress, details] of Object.entries(snapshot.nodes)) {
    const host = parseHost(nodeAddress)
    const kind = addressKind(host)
    totals[kind] += 1

    if (kind === 'tor' || kind === 'i2p' || !host) continue

    const geo = geoip.lookup(host)
    if (!geo?.ll || geo.ll.length !== 2) continue

    totals.geolocated += 1
    nodes.push({
      id: nodeAddress,
      lat: Number(geo.ll[0].toFixed(4)),
      lon: Number(geo.ll[1].toFixed(4)),
      country: geo.country ?? '',
      city: geo.city ?? '',
      kind,
      agent: details[1],
      since: details[2],
      services: details[3],
      height: details[4],
    })
  }

  const payload = {
    source: SNAPSHOT_URL,
    generatedAt: new Date().toISOString(),
    snapshotTimestamp: snapshot.timestamp,
    latestHeight: snapshot.latest_height,
    totals,
    topCountries: summarizeCountries(nodes),
    nodes,
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(payload))

  console.log(
    `Wrote ${nodes.length} geolocated reachable nodes from ${totals.reachable} Bitnodes entries to ${outputPath}`,
  )
  console.log(
    `Hidden locationless entries: Tor ${totals.tor}, I2P ${totals.i2p}, unknown ${totals.unknown}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
