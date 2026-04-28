import { Activity, Bitcoin, Database, Globe2, Radio, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BitcoinGlobe } from './BitcoinGlobe'
import type { NodeDataset } from './types'

const DATA_URL = '/data/bitcoin-nodes.json'

function formatDateTime(value: string | number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof value === 'number' ? new Date(value * 1000) : new Date(value))
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat('en-US').format(value)
}

function App() {
  const [dataset, setDataset] = useState<NodeDataset | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('本地节点数据还未生成')
        }
        return response.json() as Promise<NodeDataset>
      })
      .then((payload) => {
        if (!cancelled) setDataset(payload)
      })
      .catch((fetchError: Error) => {
        if (!cancelled) setError(fetchError.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const locationlessCount = useMemo(() => {
    if (!dataset) return 0
    return dataset.totals.tor + dataset.totals.i2p + dataset.totals.unknown
  }, [dataset])

  return (
    <main className="app-shell">
      <section className="hero-panel" aria-label="Bitcoin reachable full node globe">
        <div className="background-grid" />
        <BitcoinGlobe dataset={dataset} />

        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Bitcoin size={22} strokeWidth={2.4} />
            </span>
            <span>Bitcoin Node Map</span>
          </div>
          <a className="source-link" href="https://bitnodes.io/api/" target="_blank" rel="noreferrer">
            <Database size={16} />
            Bitnodes API
          </a>
        </header>

        <div className="hero-copy">
          <h1>Bitcoin 全球可触达全节点</h1>
          <p>实时快照数据映射到旋转地球，金黄色脉冲代表可定位的公开 IPv4 / IPv6 节点。</p>
        </div>

        <aside className="stats-panel" aria-label="Bitcoin node statistics">
          <div className="status-row">
            <span className={`status-dot ${dataset ? 'ready' : ''}`} />
            <span>{dataset ? '数据已加载' : error ? '等待数据生成' : '加载节点数据'}</span>
          </div>

          <div className="metric primary">
            <Radio size={18} />
            <div>
              <strong>{formatNumber(dataset?.totals.reachable)}</strong>
              <span>reachable nodes</span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <Globe2 size={17} />
              <div>
                <strong>{formatNumber(dataset?.totals.geolocated)}</strong>
                <span>mapped lights</span>
              </div>
            </div>
            <div className="metric">
              <Activity size={17} />
              <div>
                <strong>{formatNumber(locationlessCount)}</strong>
                <span>hidden Tor/I2P</span>
              </div>
            </div>
          </div>

          <div className="country-list">
            <div className="panel-heading">Top countries</div>
            {(dataset?.topCountries ?? []).slice(0, 5).map((item) => (
              <div className="country-row" key={item.country}>
                <span>{item.country}</span>
                <meter min="0" max={dataset?.topCountries[0]?.count ?? 1} value={item.count} />
                <b>{formatNumber(item.count)}</b>
              </div>
            ))}
          </div>
        </aside>

        <footer className="data-strip">
          <div>
            <span>Snapshot</span>
            <strong>{dataset ? formatDateTime(dataset.snapshotTimestamp) : '--'}</strong>
          </div>
          <div>
            <span>Generated</span>
            <strong>{dataset ? formatDateTime(dataset.generatedAt) : '--'}</strong>
          </div>
          <div>
            <span>Latest block</span>
            <strong>{formatNumber(dataset?.latestHeight)}</strong>
          </div>
          <button type="button" onClick={() => window.location.reload()} title="Reload data">
            <RotateCcw size={16} />
          </button>
        </footer>

        {error ? (
          <div className="error-note" role="status">
            运行 <code>npm run data</code> 生成本地 Bitnodes 快照后刷新页面。
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
