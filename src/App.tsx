import { Activity, Bitcoin, Database, Globe2, Radio, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BitcoinGlobe } from './BitcoinGlobe'
import type { NodeDataset } from './types'

const DATA_URL = '/data/bitcoin-nodes.json'
type Language = 'zh' | 'en'

const copy = {
  zh: {
    sectionLabel: 'Bitcoin 全球节点地球',
    heroTitle: 'Bitcoin 全球节点',
    heroBody: '实时快照数据映射到旋转地球，金黄色脉冲代表可定位的公开 IPv4 / IPv6 节点。',
    loaded: '数据已加载',
    waiting: '等待数据生成',
    loading: '加载节点数据',
    reachable: 'reachable nodes',
    mapped: 'mapped lights',
    hidden: 'hidden Tor/I2P',
    topCountries: 'Top countries',
    snapshot: 'Snapshot',
    generated: 'Generated',
    latestBlock: 'Latest block',
    reload: 'Reload data',
    error: '运行',
    errorTail: '生成本地 Bitnodes 快照后刷新页面。',
    footerPrefix: '版权所有',
    xLabel: 'X @MagicPower21M',
    languageLabel: 'English',
  },
  en: {
    sectionLabel: 'Bitcoin global node globe',
    heroTitle: 'Bitcoin Global Nodes',
    heroBody:
      'Live cached snapshots mapped onto a rotating globe, with golden pulses marking public IPv4 / IPv6 nodes that can be geolocated.',
    loaded: 'Data loaded',
    waiting: 'Waiting for data',
    loading: 'Loading node data',
    reachable: 'reachable nodes',
    mapped: 'mapped lights',
    hidden: 'hidden Tor/I2P',
    topCountries: 'Top countries',
    snapshot: 'Snapshot',
    generated: 'Generated',
    latestBlock: 'Latest block',
    reload: 'Reload data',
    error: 'Run',
    errorTail: 'to generate a local Bitnodes snapshot, then refresh.',
    footerPrefix: 'Copyright',
    xLabel: 'X @MagicPower21M',
    languageLabel: '中文',
  },
} satisfies Record<Language, Record<string, string>>

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
  const [language, setLanguage] = useState<Language>('zh')
  const text = copy[language]

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
      <section className="hero-panel" aria-label={text.sectionLabel}>
        <div className="background-grid" />
        <BitcoinGlobe dataset={dataset} />

        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Bitcoin size={22} strokeWidth={2.4} />
            </span>
            <span>Bitcoin Node Map</span>
          </div>
          <div className="topbar-actions">
            <a className="source-link" href="https://bitnodes.io/api/" target="_blank" rel="noreferrer">
              <Database size={16} />
              Bitnodes API
            </a>
            <button
              type="button"
              className="language-toggle"
              onClick={() => setLanguage((current) => (current === 'zh' ? 'en' : 'zh'))}
            >
              {text.languageLabel}
            </button>
          </div>
        </header>

        <div className="hero-copy">
          <h1>{text.heroTitle}</h1>
          <p>{text.heroBody}</p>
        </div>

        <aside className="stats-panel" aria-label="Bitcoin node statistics">
          <div className="status-row">
            <span className={`status-dot ${dataset ? 'ready' : ''}`} />
            <span>{dataset ? text.loaded : error ? text.waiting : text.loading}</span>
          </div>

          <div className="metric primary">
            <Radio size={18} />
            <div>
              <strong>{formatNumber(dataset?.totals.reachable)}</strong>
              <span>{text.reachable}</span>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <Globe2 size={17} />
              <div>
                <strong>{formatNumber(dataset?.totals.geolocated)}</strong>
                <span>{text.mapped}</span>
              </div>
            </div>
            <div className="metric">
              <Activity size={17} />
              <div>
                <strong>{formatNumber(locationlessCount)}</strong>
                <span>{text.hidden}</span>
              </div>
            </div>
          </div>

          <div className="country-list">
            <div className="panel-heading">{text.topCountries}</div>
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
            <span>{text.snapshot}</span>
            <strong>{dataset ? formatDateTime(dataset.snapshotTimestamp) : '--'}</strong>
          </div>
          <div>
            <span>{text.generated}</span>
            <strong>{dataset ? formatDateTime(dataset.generatedAt) : '--'}</strong>
          </div>
          <div>
            <span>{text.latestBlock}</span>
            <strong>{formatNumber(dataset?.latestHeight)}</strong>
          </div>
          <button type="button" onClick={() => window.location.reload()} title={text.reload}>
            <RotateCcw size={16} />
          </button>
        </footer>

        <div className="copyright">
          <span>{text.footerPrefix} BTCNode.OnDream.Ai</span>
          <span className="copyright-dot">·</span>
          <a href="https://x.com/MagicPower21M" target="_blank" rel="noreferrer">
            {text.xLabel}
          </a>
        </div>

        {error ? (
          <div className="error-note" role="status">
            {text.error} <code>npm run data</code> {text.errorTail}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
