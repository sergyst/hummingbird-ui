import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Icon, OutcomeBadge, Spinner, StateBadge, formatDateTime, formatMoney, useToast } from '../ui'

const KIND = {
  normal: { label: 'Normal activity', cls: 'kind-normal' },
  false_alarm: { label: 'False alarm', cls: 'kind-false' },
  structuring: { label: 'Suspicious', cls: 'kind-bad' },
}

const FINAL = ['filed', 'not_filed', 'dismissed']

// Where is the alert on its journey? Returns 4 steps with done / now / skip / todo.
function journey(alert) {
  const state = alert.state
  const processed = state === 'PROCESSED'
  const outcome = alert.outcome
  const finished = FINAL.includes(outcome)
  const stuck = state === 'STUCK' || state === 'ERROR'
  return [
    { title: 'Alert sent to Hummingbird', note: 'POST /alert_imports', status: 'done' },
    {
      title: stuck ? 'Processing failed' : 'Processed into a case',
      note: stuck ? 'Stuck after 3 attempts: contact Hummingbird support' : 'Webhook alert.processed or polling',
      status: processed ? 'done' : 'now',
    },
    {
      title: 'Investigator decides',
      note: finished ? `Outcome: ${outcome.replace('_', ' ')}` : processed ? `In progress${outcome ? ` · ${outcome}` : ''}` : 'Waiting for a case',
      status: finished ? 'done' : processed ? 'now' : 'todo',
    },
    {
      title: 'Report filed with the regulator',
      note: outcome === 'filed' ? `Filing status: ${alert.filingStatus || 'submitted'}` : outcome === 'not_filed' || outcome === 'dismissed' ? 'Not needed' : 'Only if the investigator decides to file',
      status: outcome === 'filed' ? (alert.filingStatus ? 'done' : 'now') : finished ? 'skip' : 'todo',
    },
  ]
}

export default function Scenarios({ goto, onChanged, config }) {
  const toast = useToast()
  const [list, setList] = useState(null)
  const [running, setRunning] = useState(null)
  const [result, setResult] = useState(null)
  const [alert, setAlert] = useState(null) // live copy of the alert sent by the scenario
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    api.scenarios().then(setList).catch((e) => toast('Could not load scenarios', 'error', e.message))
  }, [toast])

  // Re-read the alert sent by the scenario. Nothing polls: it runs when a scenario finishes and when Refresh is clicked.
  const reloadAlert = useCallback(async (id) => {
    setRefreshing(true)
    try {
      const d = await api.getAlert(id)
      setAlert(d.alert)
    } catch (e) {
      toast('Could not refresh the alert', 'error', e.message)
    } finally {
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => { setAlert(result?.alert || null) }, [result])

  async function run(key) {
    setRunning(key)
    setResult(null)
    try {
      const r = await api.runScenario(key)
      setResult(r)
      onChanged()
      if (r.alertSent) toast('Alert sent to Hummingbird', 'success', r.ruleFired)
    } catch (e) {
      toast(e.title || 'Scenario failed', 'error', e.message + (e.traceId ? ` (trace ${e.traceId})` : ''))
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Scenarios</h1>
          <p>Play a customer’s activity through a simulated bank monitoring system. An alert goes to Hummingbird only when a rule fires.</p>
        </div>
      </div>

      {config && !config.credentialsConfigured && (
        <div className="banner banner-warn">
          <Icon name="alert" />
          <div>
            <strong>Credentials needed for the two scenarios that send alerts</strong>
            <p>The “normal” scenario works without them, because it sends nothing.</p>
          </div>
        </div>
      )}

      <div className="scn-grid">
        {!list && <div className="muted"><Spinner /> Loading…</div>}
        {(list || []).map((s) => {
          const kind = KIND[s.key] || KIND.normal
          return (
            <div key={s.key} className={`card scn ${result?.key === s.key ? 'active' : ''}`}>
              <span className={`scn-kind ${kind.cls}`}>{kind.label}</span>
              <h3>{s.title}</h3>
              <p>{s.summary}</p>
              <div>
                <button className="btn btn-primary" onClick={() => run(s.key)} disabled={!!running}>
                  {running === s.key ? <Spinner /> : <Icon name="play" size={15} />} Run scenario
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {result && (
        <>
          <div className={`verdict ${result.alertSent ? 'fired' : 'quiet'}`}>
            <Icon name={result.alertSent ? 'alert' : 'shield'} size={22} />
            <div>
              <strong>{result.alertSent ? `Rule fired: ${result.ruleFired}` : 'No rule fired. Nothing was sent to Hummingbird.'}</strong>
              <p>{result.explanation}</p>
            </div>
          </div>

          <div className="result-grid">
            <div className="card">
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <strong><Icon name="bank" size={16} /> Bank ledger · {result.customer}</strong>
                <span className="muted">Typical inbound: {formatMoney(result.customerAvgMonthlyInboundMinor, 'USD')} / month</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Transaction</th><th>Channel</th><th>When</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {result.transactions.map((t) => (
                      <tr key={t.id} style={{ cursor: 'default' }}>
                        <td>{t.description}</td>
                        <td className="muted">{t.channel.toLowerCase()}</td>
                        <td className="muted">{formatDateTime(t.at)}</td>
                        <td style={{ textAlign: 'right' }} className={t.direction === 'CREDIT' ? 'amt-in' : 'amt-out'}>
                          {t.direction === 'CREDIT' ? '+' : '−'}{formatMoney(t.amountMinor, t.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card card-pad">
              <div className="card-title">What happens next</div>
              {!alert ? (
                <div className="muted">
                  Nothing. There is no case, no webhook and no investigator time. Run one of the other scenarios to see an alert travel through Hummingbird.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                    <strong>{alert.externalId}</strong>
                    <StateBadge state={alert.state} />
                    {alert.outcome && <OutcomeBadge outcome={alert.outcome} />}
                  </div>
                  <ul className="track">
                    {journey(alert).map((st, i) => (
                      <li key={i} className={st.status}>
                        <span className="tdot">{st.status === 'done' ? <Icon name="check" size={15} /> : i + 1}</span>
                        <div><b>{st.title}</b><small>{st.note}</small></div>
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => reloadAlert(alert.id)} disabled={refreshing}>
                      {refreshing ? <Spinner /> : <Icon name="refresh" size={15} />} Refresh
                    </button>
                    <button className="btn btn-sm" onClick={() => goto(`/alerts/${alert.id}`)}>Open alert details</button>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
                    The investigator’s decision and any filing happen inside Hummingbird. The backend picks up changes from webhooks or its own polling; click Refresh to see them here.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
