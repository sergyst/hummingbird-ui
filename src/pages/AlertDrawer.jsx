import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { CopyField, Icon, OutcomeBadge, Spinner, StateBadge, formatDateTime, formatMoney, useToast } from '../ui'

export default function AlertDrawer({ id, config, onClose, onChanged }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // 'refresh' | 'lifecycle' | 'delete'
  const [lifecycle, setLifecycle] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await api.getAlert(id))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    setData(null)
    setLifecycle(null)
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const a = data?.alert

  async function run(kind, fn) {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast(e.title || 'Request failed', 'error', e.message + (e.traceId ? ` (trace ${e.traceId})` : ''))
    } finally {
      setBusy(null)
    }
  }

  const refresh = () => run('refresh', async () => {
    const updated = await api.refreshAlert(id)
    toast(`State: ${updated.state.toLowerCase()}`, 'success')
    await load()
    onChanged()
  })

  const loadLifecycle = () => run('lifecycle', async () => {
    const res = await api.lifecycle(id)
    setLifecycle(res.case_alert || res)
    await load() // the backend stores the outcome it just learned
    onChanged()
  })

  const remove = () => run('delete', async () => {
    if (!window.confirm('Remove this alert from the local console? Nothing is deleted in Hummingbird.')) return
    await api.deleteAlert(id)
    onChanged()
    onClose()
  })

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Alert details">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Alert</div>
            <h2>{a?.externalId || '…'}</h2>
            {a && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StateBadge state={a.state} />
                {a.outcome && <OutcomeBadge outcome={a.outcome} />}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="drawer-body">
          {error && <div className="errbox">{error}</div>}
          {!data && !error && <div className="muted"><Spinner /> Loading…</div>}
          {a && (
            <>
              {(a.state === 'STUCK' || a.state === 'ERROR') && (
                <div className="errbox section">
                  <strong>{a.state === 'STUCK' ? 'Processing failed after 3 attempts.' : 'Processing error.'}</strong>
                  <div style={{ marginTop: 4 }}>
                    {a.errorMessage || 'Hummingbird does not include a reason for stuck alerts. Fix the payload, then ask support@hummingbird.co to un-stick it — or dismiss it and resend with a new alert id.'}
                  </div>
                </div>
              )}

              <div className="section">
                <h4>Details</h4>
                <dl className="kv">
                  <dt>Rule</dt><dd>{a.rule}</dd>
                  <dt>Triggered</dt><dd>{formatDateTime(a.triggeredAt)}</dd>
                  <dt>Subject</dt><dd>{a.subjectName || '—'}</dd>
                  <dt>Volume</dt>
                  <dd>{formatMoney(a.amountMinor, a.currency)}{a.txCount ? <span className="muted"> · {a.txCount} transaction{a.txCount > 1 ? 's' : ''}</span> : null}</dd>
                  <dt>Outcome</dt><dd>{a.outcome ? <OutcomeBadge outcome={a.outcome} /> : '—'}</dd>
                  <dt>Filing status</dt><dd>{a.filingStatus || '—'}</dd>
                  <dt>Review tags</dt>
                  <dd>{a.reviewTags.length ? a.reviewTags.map((t) => <span className="tag" key={t}>{t}</span>) : '—'}</dd>
                  <dt>Comments</dt><dd>{a.comments || '—'}</dd>
                  <dt>Origin</dt><dd>{a.source === 'WEBHOOK' ? 'Learned from a webhook' : 'Submitted from this console'}</dd>
                  <dt>Submitted</dt><dd>{formatDateTime(a.createdAt)}</dd>
                  <dt>Processed</dt><dd>{formatDateTime(a.processedAt)}</dd>
                  <dt>Last checked</dt><dd>{formatDateTime(a.lastCheckedAt)}</dd>
                </dl>
              </div>

              <div className="section">
                <h4>Hummingbird references</h4>
                <CopyField label="Processing token" value={a.processingToken} />
                <CopyField label="Alert token" value={a.alertToken} />
                <CopyField label="Case token" value={a.caseToken} />
                <CopyField label="Review token" value={a.reviewToken} />
                {!a.processingToken && !a.alertToken && !a.caseToken && <span className="muted">Nothing yet — still being processed.</span>}
                {a.caseToken && config?.dashboardUrl && (
                  <a className="btn btn-sm" href={config.dashboardUrl} target="_blank" rel="noreferrer" style={{ marginTop: 6, textDecoration: 'none' }}>
                    <Icon name="external" size={14} /> Open Hummingbird dashboard
                  </a>
                )}
              </div>

              <div className="section">
                <h4>Case lifecycle</h4>
                {!lifecycle ? (
                  <button className="btn btn-sm" onClick={loadLifecycle} disabled={busy === 'lifecycle' || a.state !== 'PROCESSED'}>
                    {busy === 'lifecycle' ? <Spinner /> : <Icon name="flow" size={15} />} Fetch from Hummingbird
                  </button>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      Outcome: <strong>{lifecycle.outcome || '—'}</strong>
                      {lifecycle.group_id != null && <span className="muted"> · group #{lifecycle.group_id}</span>}
                    </div>
                    <ul className="timeline">
                      {(lifecycle.lifecycle_events || []).map((e, i) => (
                        <li key={i}>
                          <b>{e.event}</b>
                          <small>{formatDateTime(e.timestamp)}{e.actor?.full_name ? ` · ${e.actor.full_name}` : ''}{e.review_type_name ? ` · ${e.review_type_name}` : ''}</small>
                        </li>
                      ))}
                      {!(lifecycle.lifecycle_events || []).length && <li><b>No lifecycle events yet</b></li>}
                    </ul>
                  </>
                )}
                {a.state !== 'PROCESSED' && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Available once the alert has been processed.</div>}
              </div>

              <div className="section">
                <h4>Activity</h4>
                <ul className="timeline">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <b>{e.type}</b>
                      <small>{formatDateTime(e.at)}{e.detail ? ` · ${e.detail}` : ''}</small>
                    </li>
                  ))}
                  {!data.events.length && <li><b>No activity recorded</b></li>}
                </ul>
              </div>
            </>
          )}
        </div>

        {a && (
          <div className="drawer-foot">
            <button className="btn btn-primary" onClick={refresh} disabled={!!busy || !a.processingToken}>
              {busy === 'refresh' ? <Spinner /> : <Icon name="refresh" size={16} />} Check status
            </button>
            <button className="btn btn-danger" onClick={remove} disabled={!!busy} style={{ marginLeft: 'auto' }}>
              <Icon name="trash" size={16} /> Remove locally
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
