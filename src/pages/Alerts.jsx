import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { EmptyState, Icon, OutcomeBadge, OUTCOMES, OUTCOME_META, Spinner, StateBadge, STATES, STATE_META, formatMoney, timeAgo, useToast } from '../ui'

export default function Alerts({ onOpenAlert, goto, reloadKey, onChanged }) {
  const toast = useToast()
  const [state, setState] = useState('ALL')
  const [q, setQ] = useState('')
  const [outcome, setOutcome] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async (silent = false) => {
    const mine = ++reqId.current
    if (!silent) setLoading(true)
    try {
      const [list, stats] = await Promise.all([
        api.listAlerts({ state, q: debouncedQ, outcome, page, size: 12 }),
        api.stats(),
      ])
      if (mine !== reqId.current) return // a newer request superseded this one
      setData(list)
      setCounts(stats.byState)
      setTotal(stats.total)
    } catch (e) {
      if (!silent) toast('Could not load alerts', 'error', e.message)
    } finally {
      if (mine === reqId.current) setLoading(false)
    }
  }, [state, debouncedQ, outcome, page, toast])

  useEffect(() => { load() }, [load, reloadKey])

  // keep pending alerts fresh without user action
  useEffect(() => {
    const t = setInterval(() => load(true), 8000)
    return () => clearInterval(t)
  }, [load])

  async function refreshPending() {
    setRefreshing(true)
    try {
      const r = await api.refreshPending()
      toast(r.checked ? `Checked ${r.checked} pending · ${r.changed} updated` : 'No pending alerts to check',
        r.failed ? 'error' : 'success', r.failed ? `${r.failed} check(s) failed` : undefined)
      await load(true)
      onChanged()
    } catch (e) {
      toast(e.title || 'Refresh failed', 'error', e.message)
    } finally {
      setRefreshing(false)
    }
  }

  const chip = (key, label, n) => (
    <button key={key} className={`chip ${state === key ? 'on' : ''}`} onClick={() => { setState(key); setPage(0) }}>
      {label}<small>{n ?? 0}</small>
    </button>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p>Everything sent to Hummingbird from this console, plus alerts reported by webhook.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={refreshPending} disabled={refreshing || !(counts.PENDING > 0)}>
            {refreshing ? <Spinner /> : <Icon name="refresh" size={16} />} Check pending
          </button>
          <button className="btn btn-primary" onClick={() => goto('/new')}><Icon name="plus" size={16} /> New alert</button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search id, rule, subject or case…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips">
            {chip('ALL', 'All', total)}
            {STATES.map((s) => chip(s, STATE_META[s].label, counts[s]))}
          </div>
          <select className="select" style={{ width: 'auto' }} value={outcome} aria-label="Filter by outcome"
                  onChange={(e) => { setOutcome(e.target.value); setPage(0) }}>
            <option value="">Any outcome</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_META[o].label}</option>)}
          </select>
        </div>

        {!data ? (
          <div className="empty muted"><Spinner /> Loading…</div>
        ) : data.items.length === 0 ? (
          <EmptyState title={total === 0 ? 'No alerts yet' : 'No alerts match'} icon="inbox">
            {total === 0
              ? 'Submit an alert to the Hummingbird sandbox and it will show up here, with live processing status.'
              : 'Try a different search or clear the state filter.'}
            {total === 0 && <><br /><br /><button className="btn btn-primary" onClick={() => goto('/new')}><Icon name="plus" size={16} /> Create the first alert</button></>}
          </EmptyState>
        ) : (
          <div className="table-wrap">
          <table style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .12s' }}>
            <thead>
              <tr><th>Alert</th><th>Subject</th><th>Volume</th><th>State</th><th>Outcome</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id} onClick={() => onOpenAlert(a.id)}>
                  <td>
                    <div className="cell-main">{a.externalId}</div>
                    <div className="cell-sub">{a.rule}</div>
                  </td>
                  <td>{a.subjectName || <span className="muted">—</span>}</td>
                  <td title={a.txCount ? `${a.txCount} transaction(s)` : ''}>{formatMoney(a.amountMinor, a.currency)}{a.txCount > 1 && <span className="muted"> · {a.txCount} tx</span>}</td>
                  <td><StateBadge state={a.state} /></td>
                  <td><OutcomeBadge outcome={a.outcome} />{a.filingStatus && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{a.filingStatus}</span>}</td>
                  <td className="muted" title={a.createdAt}>{timeAgo(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {data && data.totalItems > 0 && (
          <div className="pager">
            <span>{data.page * data.size + 1}–{Math.min((data.page + 1) * data.size, data.totalItems)} of {data.totalItems}</span>
            <span className="actions">
              <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="chevL" size={15} /> Prev</button>
              <button className="btn btn-sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next <Icon name="chevR" size={15} /></button>
            </span>
          </div>
        )}
      </div>
    </>
  )
}
