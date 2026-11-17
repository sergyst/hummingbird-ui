import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { CopyField, EmptyState, Icon, Spinner, formatDateTime, timeAgo, useToast } from '../ui'

// The backend returns Hummingbird's JSON unchanged, so the helpers below read it defensively:
// a list may be a bare array or sit under cases / reviews / data / items / results / edges.

const LIST_KEYS = ['cases', 'reviews', 'data', 'items', 'results', 'edges']

export function extractList(res) {
  if (Array.isArray(res)) return res
  if (!res || typeof res !== 'object') return []
  const key = LIST_KEYS.find((k) => Array.isArray(res[k])) || Object.keys(res).find((k) => Array.isArray(res[k]))
  const list = key ? res[key] : []
  return list.map((x) => (x && typeof x === 'object' && x.node ? x.node : x))
}

/** Cursor for the next page, if the response carries one. */
export function nextCursor(res) {
  if (!res || typeof res !== 'object') return null
  const info = res.page_info || res.pageInfo || res.pagination || {}
  if (info.has_next_page === false || info.hasNextPage === false) return null
  return info.end_cursor || info.endCursor || info.next_cursor || info.nextCursor
    || res.next_cursor || res.nextCursor || res.end_cursor || null
}

const text = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'object') return text(v.name ?? v.title ?? v.slug ?? v.label ?? v.token ?? null)
  return String(v)
}
const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = text(o?.[k])
    if (v) return v
  }
  return null
}
const caseToken = (c) => pick(c, 'token', 'id')
const caseTitle = (c) => pick(c, 'title', 'name', 'subject', 'summary', 'case_id', 'display_id')
const caseStatus = (c) => pick(c, 'status', 'state', 'outcome')
const caseWorkflow = (c) => pick(c, 'workflow', 'workflow_name', 'workflow_slug')
const createdAt = (c) => pick(c, 'created_at', 'createdAt', 'opened_at')

function Status({ value }) {
  if (!value) return <span className="muted">—</span>
  const v = value.toLowerCase()
  const kind = /(filed|complete|closed|done)/.test(v) && !/not/.test(v) ? 'processed'
    : /(stuck|error|fail)/.test(v) ? 'stuck'
    : /(dismiss|cancel)/.test(v) ? 'dismissed' : 'pending'
  return <span className={`badge badge-${kind}`}><span className="dot" />{value}</span>
}

export default function Cases({ openToken, onOpen, onClose, reloadKey }) {
  const toast = useToast()
  const [workflow, setWorkflow] = useState('triage')
  const [workflowInput, setWorkflowInput] = useState('triage')
  const [first, setFirst] = useState(25)
  const [items, setItems] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async (after = null) => {
    const mine = ++reqId.current
    setLoading(true)
    try {
      const res = await api.listCases({ workflow, first, after })
      if (mine !== reqId.current) return
      const list = extractList(res)
      setItems((prev) => (after && prev ? [...prev, ...list] : list))
      setCursor(nextCursor(res))
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
          <input id="wf" className="input" style={{ width: 180 }} value={workflowInput} placeholder="(any)"
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
              <thead><tr><th>Case</th><th>Workflow</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {items.map((c, i) => {
                  const t = caseToken(c)
                  return (
                    <tr key={t || i} onClick={() => t && onOpen(t)}>
                      <td>
                        <div className="cell-main">{caseTitle(c) || t || '—'}</div>
                        {t && caseTitle(c) && <div className="cell-sub">{t}</div>}
                      </td>
                      <td>{caseWorkflow(c) || <span className="muted">—</span>}</td>
                      <td><Status value={caseStatus(c)} /></td>
                      <td className="muted" title={createdAt(c) || ''}>{timeAgo(createdAt(c))}</td>
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
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setCase(null); setReviews(null); setError(null)
    api.getCase(token).then((r) => alive && setCase(r)).catch((e) => alive && setError(e.message))
    api.listReviews({ case_token: token, page_size: 25 })
      .then((r) => alive && setReviews(r))
      .catch((e) => alive && setReviews({ error: e.message }))
    return () => { alive = false }
  }, [token])

  // some responses wrap the case: { case: {...} }
  const c = kase && (kase.case && typeof kase.case === 'object' ? kase.case : kase)
  const scalars = c ? Object.entries(c).filter(([, v]) => v == null || typeof v !== 'object').slice(0, 14) : []
  const reviewList = reviews && !reviews.error ? extractList(reviews) : []

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Case details">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Case</div>
            <h2>{(c && caseTitle(c)) || token}</h2>
            {c && <div style={{ marginTop: 10 }}><Status value={caseStatus(c)} /></div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="drawer-body">
          {error && <div className="errbox">{error}</div>}
          {!kase && !error && <div className="muted"><Spinner /> Loading…</div>}

          {c && (
            <>
              <div className="section">
                <h4>Details</h4>
                <dl className="kv">
                  {scalars.map(([k, v]) => (
                    <FragmentRow key={k} k={k} v={v} />
                  ))}
                </dl>
              </div>
              <div className="section">
                <h4>Reference</h4>
                <CopyField label="Case token" value={caseToken(c) || token} />
              </div>
            </>
          )}

          <div className="section">
            <h4>Reviews</h4>
            {!reviews ? <span className="muted"><Spinner /> Loading…</span>
              : reviews.error ? <div className="errbox">{reviews.error}</div>
              : reviewList.length === 0 ? <span className="muted">No reviews for this case yet.</span>
              : (
                <ul className="timeline">
                  {reviewList.map((r, i) => (
                    <li key={caseToken(r) || i}>
                      <div className="cell-main">{pick(r, 'review_type_name', 'type', 'name', 'title') || caseToken(r) || 'Review'}</div>
                      <div className="cell-sub">
                        {[pick(r, 'status', 'state'), pick(r, 'assignee', 'assigned_to'), formatDateTime(pick(r, 'created_at', 'createdAt'))]
                          .filter((x) => x && x !== '—').join(' · ')}
                      </div>
                    </li>
                  ))}
                </ul>
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
                <pre className="raw">{JSON.stringify(reviews, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function FragmentRow({ k, v }) {
  const label = k.replace(/_/g, ' ')
  const isDate = /(_at|At)$/.test(k) && v
  return (
    <>
      <dt style={{ textTransform: 'capitalize' }}>{label}</dt>
      <dd>{v == null || v === '' ? '—' : isDate ? formatDateTime(String(v)) : String(v)}</dd>
    </>
  )
}
