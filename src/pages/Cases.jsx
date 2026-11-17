import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { CopyField, EmptyState, Icon, Spinner, formatDateTime, formatMoney, timeAgo, useToast } from '../ui'

// Shapes below follow the Hummingbird API reference (apiVersion 2026-02-05); the backend passes them through unchanged.
//   GET /cases           -> { success, cases: [{ cursor, case: { token, created_at, updated_at } }],
//                             page_info: { end_cursor, has_next_page, ... } }          (params: first, after, workflow)
//   GET /cases/{token}   -> { success, case: { token, id, name, created_at, updated_at, reviews: [...], filings: [...] } }
//   GET /reviews         -> { reviews: [{ token, case_token, status, stage: {title}, queue: {name}, assignee: {name}, ... }],
//                             next_page_token }                                         (params: page_size, page_token, case_token)
//   errors               -> { success: false, error: { type, message } }

const REVIEW_STATUS = {
  CREATED: 'pending', OPENED: 'pending', WORK_STARTED: 'pending', READY_FOR_REVIEW: 'pending', PENDING: 'pending',
  CHANGES_REQUESTED: 'stuck', APPROVED: 'processed', COMPLETED: 'processed', CANCELLED: 'dismissed',
}

function ReviewStatus({ value }) {
  if (!value) return <span className="muted">—</span>
  const key = String(value).toUpperCase()
  return (
    <span className={`badge badge-${REVIEW_STATUS[key] || 'pending'}`}>
      <span className="dot" />{key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  )
}

const DONE = new Set(['COMPLETED', 'CANCELLED', 'APPROVED'])

/** The review that best describes where a case stands: the first still-active one, else the latest. */
function summarize(kase) {
  const reviews = kase?.reviews || []
  if (reviews.length === 0) return null
  const active = reviews.find((r) => !DONE.has(String(r.status || '').toUpperCase()))
  return { review: active || reviews[reviews.length - 1], count: reviews.length, name: kase.name }
}

const CONCURRENCY = 4

export default function Cases({ openToken, onOpen, onClose, reloadKey }) {
  const toast = useToast()
  const [workflow, setWorkflow] = useState('triage')
  const [workflowInput, setWorkflowInput] = useState('triage')
  const [first, setFirst] = useState(25)
  const [items, setItems] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const [details, setDetails] = useState({}) // token -> { key, case } | { key, error }
  const inFlight = useRef(new Set())

  // The list response has no workflow/status, so fetch each listed case (a few at a time) and cache it.
  // The cache key includes updated_at, so a case that changed is re-fetched on the next refresh.
  useEffect(() => {
    if (!items) return
    const todo = items.filter((c) => {
      const key = `${c.token}|${c.updated_at}`
      return details[c.token]?.key !== key && !inFlight.current.has(key)
    })
    if (todo.length === 0) return
    let alive = true
    const queue = [...todo]
    const worker = async () => {
      while (alive && queue.length) {
        const c = queue.shift()
        const key = `${c.token}|${c.updated_at}`
        inFlight.current.add(key)
        try {
          const r = await api.getCase(c.token)
          if (alive) setDetails((d) => ({ ...d, [c.token]: { key, case: r.case } }))
        } catch (e) {
          if (alive) setDetails((d) => ({ ...d, [c.token]: { key, error: e.message } }))
        } finally {
          inFlight.current.delete(key)
        }
      }
    }
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) worker()
    return () => { alive = false }
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (after = null) => {
    const mine = ++reqId.current
    setLoading(true)
    try {
      const res = await api.listCases({ workflow, first, after })
      if (mine !== reqId.current) return
      const list = (res.cases || []).map((x) => x.case).filter(Boolean)
      setItems((prev) => {
        const all = after && prev ? [...prev, ...list] : list
        // with a workflow filter a case can appear once per matching review: show each case once
        return all.filter((c, i) => all.findIndex((o) => o.token === c.token) === i)
      })
      const info = res.page_info || {}
      setCursor(info.has_next_page ? info.end_cursor || null : null)
    } catch (e) {
      if (mine === reqId.current) toast(e.title || 'Could not load cases', 'error', e.message)
    } finally {
      if (mine === reqId.current) setLoading(false)
    }
  }, [workflow, first, toast])

  useEffect(() => { load() }, [load, reloadKey])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cases</h1>
          <p>Cases Hummingbird created from your alerts, read live from the API.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => load()} disabled={loading}>
            {loading ? <Spinner /> : <Icon name="refresh" size={16} />} Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setWorkflow(workflowInput.trim()) }}>
          <label className="muted" htmlFor="wf">Workflow</label>
          <input id="wf" className="input" style={{ width: 180 }} value={workflowInput} placeholder="(any), e.g. triage"
                 onChange={(e) => setWorkflowInput(e.target.value)} />
          <button className="btn btn-sm" type="submit">Apply</button>
          <span style={{ flex: 1 }} />
          <label className="muted" htmlFor="pg">Page size</label>
          <select id="pg" className="select" style={{ width: 'auto' }} value={first} onChange={(e) => setFirst(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </form>

        {!items ? (
          <div className="empty muted"><Spinner /> Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState title="No cases found" icon="inbox">
            {workflow ? <>No cases in the <code>{workflow}</code> workflow yet. Alerts become cases after processing (usually under 5 minutes).</> : 'No cases yet.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .12s' }}>
              <thead><tr><th>Case</th><th>Workflow</th><th>Stage</th><th>Status</th><th>Created</th><th>Updated</th></tr></thead>
              <tbody>
                {items.map((c) => {
                  const d = details[c.token]
                  const sum = d?.case ? summarize(d.case) : null
                  const pending = !d
                  return (
                    <tr key={c.token} onClick={() => onOpen(c.token)}>
                      <td>
                        <div className="cell-main">{d?.case?.name || <code>{c.token}</code>}</div>
                        {d?.case?.name && <div className="cell-sub"><code>{c.token}</code></div>}
                      </td>
                      <td>{pending ? <Spinner /> : sum?.review?.workflow || <span className="muted">—</span>}
                        {sum && sum.count > 1 && <span className="muted" title={`${sum.count} reviews`}> · {sum.count} reviews</span>}
                      </td>
                      <td>{pending ? '' : sum?.review?.stage || <span className="muted">—</span>}</td>
                      <td>
                        {pending ? '' : d.error ? <span className="muted" title={d.error}>unavailable</span>
                          : sum ? <ReviewStatus value={sum.review.status} /> : <span className="muted">no review yet</span>}
                      </td>
                      <td className="muted" title={c.created_at}>{timeAgo(c.created_at)}</td>
                      <td className="muted" title={c.updated_at}>{timeAgo(c.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="pager">
            <span>{items.length} loaded</span>
            <span className="actions">
              <button className="btn btn-sm" disabled={!cursor || loading} onClick={() => load(cursor)}>
                Load more <Icon name="chevR" size={15} />
              </button>
            </span>
          </div>
        )}
      </div>

      {openToken && <CaseDrawer token={openToken} onClose={onClose} />}
    </>
  )
}

function CaseDrawer({ token, onClose }) {
  const [kase, setCase] = useState(null)
  const [error, setError] = useState(null)
  const [reviews, setReviews] = useState(null) // { items, next, error }
  const [moreLoading, setMoreLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setCase(null); setReviews(null); setError(null)
    api.getCase(token).then((r) => alive && setCase(r.case)).catch((e) => alive && setError(e.message))
    api.listReviews({ case_token: token, page_size: 25 })
      .then((r) => alive && setReviews({ items: r.reviews || [], next: r.next_page_token || null }))
      .catch((e) => alive && setReviews({ items: [], next: null, error: e.message }))
    return () => { alive = false }
  }, [token])

  async function loadMoreReviews() {
    setMoreLoading(true)
    try {
      const r = await api.listReviews({ case_token: token, page_size: 25, page_token: reviews.next })
      setReviews((p) => ({ items: [...p.items, ...(r.reviews || [])], next: r.next_page_token || null }))
    } catch (e) {
      setReviews((p) => ({ ...p, error: e.message }))
    } finally {
      setMoreLoading(false)
    }
  }

  const caseReviews = kase?.reviews || []
  const alerts = caseReviews.flatMap((r) => (r.alerts || []).map((a) => ({ ...a, workflow: r.workflow })))
  const decisions = caseReviews.flatMap((r) => (r.decisions || []).map((d) => ({ ...d, workflow: r.workflow })))
  const filings = kase?.filings || []

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Case details">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Case</div>
            <h2>{kase?.name || kase?.id || token}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="drawer-body">
          {error && <div className="errbox">{error}</div>}
          {!kase && !error && <div className="muted"><Spinner /> Loading…</div>}

          {kase && (
            <>
              <div className="section">
                <h4>Details</h4>
                <dl className="kv">
                  <dt>Name</dt><dd>{kase.name || '—'}</dd>
                  <dt>Your case id</dt><dd>{kase.id || '—'}</dd>
                  <dt>Created</dt><dd>{formatDateTime(kase.created_at)}</dd>
                  <dt>Updated</dt><dd>{formatDateTime(kase.updated_at)}</dd>
                </dl>
                <div style={{ marginTop: 12 }}><CopyField label="Case token" value={kase.token || token} /></div>
              </div>

              {alerts.length > 0 && (
                <div className="section">
                  <h4>Alerts</h4>
                  <ul className="timeline">
                    {alerts.map((a, i) => (
                      <li key={a.token || a.id || i}>
                        <div className="cell-main">{a.rule || a.id}</div>
                        <div className="cell-sub">
                          {[a.id, a.workflow, a.triggered_at && formatDateTime(a.triggered_at),
                            a.amount?.amount != null && formatMoney(a.amount.amount, a.amount.currency_code)]
                            .filter(Boolean).join(' · ')}
                        </div>
                        {(a.other_info || []).map((o) => (
                          <div className="cell-sub" key={o.label}>{o.label}: {o.value}</div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {decisions.length > 0 && (
                <div className="section">
                  <h4>Decisions</h4>
                  <ul className="timeline">
                    {decisions.map((d, i) => (
                      <li key={`${d.action_id}-${i}`}>
                        <div className="cell-main">{d.action_name}: {d.choice_name}</div>
                        <div className="cell-sub">
                          {[d.arbiter?.name || d.arbiter?.email, d.decision_made_at && formatDateTime(d.decision_made_at)].filter(Boolean).join(' · ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {filings.length > 0 && (
                <div className="section">
                  <h4>Filings</h4>
                  <ul className="timeline">
                    {filings.map((f, i) => (
                      <li key={f.token || i}>
                        <div className="cell-main">{f.jurisdiction}{f.workflow ? ` · ${f.workflow}` : ''}</div>
                        <div className="cell-sub">{[f.id, f.filing_institution_id].filter(Boolean).join(' · ') || f.token}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="section">
            <h4>Reviews</h4>
            {!reviews ? <span className="muted"><Spinner /> Loading…</span>
              : reviews.error ? <div className="errbox">{reviews.error}</div>
              : reviews.items.length === 0 ? <span className="muted">No reviews for this case yet.</span>
              : (
                <>
                  <ul className="timeline">
                    {reviews.items.map((r) => (
                      <li key={r.token}>
                        <div className="cell-main">
                          {r.stage?.title || r.type_canonical_id || 'Review'} <ReviewStatus value={r.status} />
                        </div>
                        <div className="cell-sub">
                          {[r.type_canonical_id, r.queue?.name, r.assignee?.name || r.assignee?.email,
                            r.review_due_at && `due ${formatDateTime(r.review_due_at)}`,
                            r.completed_at && `completed ${formatDateTime(r.completed_at)}`,
                            r.cancellation?.reason && `cancelled: ${r.cancellation.reason}`]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {reviews.next && (
                    <button className="btn btn-sm" onClick={loadMoreReviews} disabled={moreLoading}>
                      {moreLoading ? <Spinner /> : null} Load more reviews
                    </button>
                  )}
                </>
              )}
          </div>

          {(kase || reviews) && (
            <div className="section">
              <h4>Raw response</h4>
              <details>
                <summary className="muted" style={{ cursor: 'pointer' }}>Case</summary>
                <pre className="raw">{JSON.stringify(kase, null, 2)}</pre>
              </details>
              <details>
                <summary className="muted" style={{ cursor: 'pointer' }}>Reviews</summary>
                <pre className="raw">{JSON.stringify(reviews?.items, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
