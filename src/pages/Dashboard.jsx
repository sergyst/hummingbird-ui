import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { EmptyState, Icon, StateBadge, formatDuration, timeAgo, STATES, STATE_META } from '../ui'

function Kpi({ icon, tone, value, label }) {
  const tones = {
    indigo: ['#eef0ff', '#4f46e5'], amber: ['#fdf1dc', '#a5640a'], green: ['#e4f6ee', '#12805c'],
    red: ['#fde8ea', '#c42b3b'], slate: ['#eceff5', '#5a6479'],
  }
  const [bg, fg] = tones[tone]
  return (
    <div className="card kpi">
      <div className="kpi-icon" style={{ background: bg, color: fg }}><Icon name={icon} size={20} /></div>
      <div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  )
}

export default function Dashboard({ config, onOpenAlert, goto, reloadKey }) {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState(null)

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.stats(), api.listAlerts({ size: 6 })])
      setStats(s)
      setRecent(r.items)
    } catch {
      /* the global banner already explains connectivity problems */
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load, reloadKey])

  const by = stats?.byState || {}
  const needAttention = (by.STUCK || 0) + (by.ERROR || 0)
  const max = Math.max(1, ...(stats?.last14Days || []).map((d) => d.count))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>How alerts you send to Hummingbird are being processed.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => goto('/new')}><Icon name="plus" size={16} /> New alert</button>
        </div>
      </div>

      {config && !config.credentialsConfigured && (
        <div className="banner banner-warn">
          <Icon name="alert" />
          <div>
            <strong>API credentials are not configured</strong>
            <p>
              Create an API key in Hummingbird (Settings → Organization Settings → Developers) and start the backend with
              {' '}<code>HUMMINGBIRD_CLIENT_ID</code> and <code>HUMMINGBIRD_CLIENT_SECRET</code>.
            </p>
          </div>
        </div>
      )}
      {config && config.credentialsConfigured && !config.webhookSecretConfigured && (
        <div className="banner banner-info">
          <Icon name="bolt" />
          <div>
            <strong>Webhooks are not set up — status is tracked by polling</strong>
            <p>
              For instant updates, register <code>/api/webhooks/hummingbird</code> as a webhook endpoint for the
              “Alert Processed” and “Alert Stuck” events and set <code>HUMMINGBIRD_WEBHOOK_SECRET</code>.
            </p>
          </div>
        </div>
      )}

      <div className="kpis">
        <Kpi icon="bell" tone="indigo" value={stats?.total ?? '—'} label="Total alerts" />
        <Kpi icon="clock" tone="amber" value={by.PENDING ?? '—'} label="Awaiting processing" />
        <Kpi icon="check" tone="green" value={by.PROCESSED ?? '—'} label="Processed into cases" />
        <Kpi icon="alert" tone={needAttention ? 'red' : 'slate'} value={stats ? needAttention : '—'} label="Stuck or failed" />
        <Kpi icon="shield" tone="indigo" value={stats ? (stats.byOutcome?.filed || 0) : '—'} label="Reports filed" />
        <Kpi icon="bolt" tone="slate" value={formatDuration(stats?.avgProcessingSeconds)} label="Avg. time to process" />
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title">Alerts submitted · last 14 days</div>
          <div className="bars">
            {(stats?.last14Days || []).map((d) => (
              <div className="bar-col" key={d.date} title={`${d.date}: ${d.count}`}>
                <b>{d.count || ''}</b>
                <div className={`bar ${d.count ? '' : 'zero'}`} style={{ height: `${(d.count / max) * 100}%` }} />
                <span>{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title">By state</div>
          <div className="dist">
            {STATES.map((s) => by[s] ? (
              <i key={s} className={`c-${s.toLowerCase()}`} style={{ width: `${(by[s] / (stats.total || 1)) * 100}%` }} />
            ) : null)}
          </div>
          <div className="legend">
            {STATES.map((s) => (
              <div className="legend-row" key={s}>
                <span className={`sw c-${s.toLowerCase()}`} />
                {STATE_META[s].label}
                <b>{by[s] ?? 0}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <strong>Recent alerts</strong>
          <button className="btn btn-sm" onClick={() => goto('/alerts')}>View all</button>
        </div>
        {recent && recent.length === 0 ? (
          <EmptyState title="No alerts yet" icon="bell">
            Send your first alert to the Hummingbird sandbox and watch it move from pending to processed.
          </EmptyState>
        ) : (
          <table>
            <tbody>
              {(recent || []).map((a) => (
                <tr key={a.id} onClick={() => onOpenAlert(a.id)}>
                  <td>
                    <div className="cell-main">{a.externalId}</div>
                    <div className="cell-sub">{a.rule}</div>
                  </td>
                  <td><StateBadge state={a.state} /></td>
                  <td className="muted" style={{ textAlign: 'right' }}>{timeAgo(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
