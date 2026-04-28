# Bitcoin Node Map

Interactive 3D Bitcoin reachable node globe built with React, Vite, and Three.js.

## Data Cache

The browser never calls Bitnodes directly. It only reads the local static file:

```txt
public/data/bitcoin-nodes.json
```

The data script is cache-first:

```bash
npm run data
```

By default it reuses the local cache for 24 hours and only calls Bitnodes when the cache is stale or missing. This prevents every build, deploy, or visitor from hitting Bitnodes.

Force a refresh manually:

```bash
npm run data:refresh
```

Customize the cache TTL:

```bash
BITNODES_CACHE_TTL_HOURS=12 npm run data
```

If Bitnodes returns a rate limit or temporary error while a local cache exists, the script reuses the cached file instead of failing the build.

## Daily Refresh

Run this once per day from your server, CI, or cron:

```bash
cd "/Users/neo/Documents/Bitcoin Node Map"
npm run data:refresh
```

Example cron entry:

```cron
17 3 * * * cd "/Users/neo/Documents/Bitcoin Node Map" && npm run data:refresh >> ./bitnodes-refresh.log 2>&1
```

The front end will serve the latest cached JSON after the next deploy or static file sync.

## Development

```bash
npm install
npm run data
npm run dev
```

## Build

```bash
npm run build
```
