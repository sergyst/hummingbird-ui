import { useState } from 'react'
import { api } from '../api'
import { Icon, Spinner, useToast } from '../ui'

const TEMPLATES = [
  {
    name: 'Structuring pattern',
    values: {
      rule: 'Structuring: multiple cash deposits just under reporting threshold',
      comments: 'Five cash deposits between $9,000 and $9,900 across three branches within 48 hours.',
      reviewTags: 'structuring, cash',
      subjectName: 'Jordan A. Whitfield',
      amount: '48750.00',
      currency: 'USD',
      direction: 'CREDIT',
    },
  },
  {
    name: 'Rapid movement of funds',
    values: {
      rule: 'Rapid in/out: funds withdrawn within 24h of deposit',
      comments: 'Incoming wire of $120,000 fully moved out via two outbound transfers the same day.',
      reviewTags: 'rapid-movement, wire',
      subjectName: 'Northwind Trading LLC',
      amount: '120000.00',
      currency: 'USD',
      direction: 'DEBIT',
    },
  },
  {
    name: 'Crypto off-ramp',
    values: {
      rule: 'High-risk counterparty: crypto exchange off-ramp',
      comments: 'Large transfer to an exchange wallet flagged by the screening provider.',
      reviewTags: 'crypto, high-risk',
      subjectName: 'Maria Kovalenko',
      amount: '15500.00',
      currency: 'USD',
      direction: 'DEBIT',
    },
  },
]

const empty = { id: '', rule: '', comments: '', reviewTags: '', subjectName: '', amount: '', currency: 'USD', direction: 'DEBIT' }

export default function SubmitAlert({ config, goto, onChanged }) {
  const toast = useToast()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const amountMinor = form.amount.trim() === '' ? null : Math.round(parseFloat(form.amount) * 100)
      if (amountMinor != null && (Number.isNaN(amountMinor) || amountMinor < 0)) throw new Error('Amount must be a positive number')
      const created = await api.submitAlert({
        id: form.id.trim() || null,
        rule: form.rule.trim(),
        comments: form.comments.trim() || null,
        reviewTags: form.reviewTags.split(',').map((t) => t.trim()).filter(Boolean),
        subjectName: form.subjectName.trim() || null,
        amountMinor,
        currency: amountMinor != null ? form.currency.trim() || 'USD' : null,
        direction: form.direction,
      })
      toast('Alert accepted by Hummingbird', 'success', `${created.externalId} is pending processing (usually under 5 minutes).`)
      onChanged()
      goto(`/alerts/${created.id}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New alert</h1>
          <p>Sends an alert import to the {config?.sandbox ? 'Hummingbird sandbox' : 'Hummingbird API'}.</p>
        </div>
      </div>

      <div className="form-layout">
        <form className="card card-pad" onSubmit={submit}>
          <div className="templates">
            <span className="muted">Start from an example:</span>
            {TEMPLATES.map((t) => (
              <button type="button" key={t.name} className="chip" onClick={() => setForm({ ...empty, ...t.values })}>{t.name}</button>
            ))}
          </div>

          <div className="form-grid">
            <div className="field full">
              <label htmlFor="rule">Rule *</label>
              <input id="rule" className="input" required maxLength={256} value={form.rule} onChange={set('rule')}
                     placeholder="What rule triggered this alert?" />
            </div>
            <div className="field full">
              <label htmlFor="comments">Comments</label>
              <textarea id="comments" className="textarea" value={form.comments} onChange={set('comments')}
                        placeholder="Context for the investigator" />
            </div>
            <div className="field">
              <label htmlFor="id">Alert ID</label>
              <input id="id" className="input" value={form.id} onChange={set('id')} placeholder="Auto-generated if empty" />
              <small>Must be unique — a repeated ID is treated as a duplicate.</small>
            </div>
            <div className="field">
              <label htmlFor="tags">Review tags</label>
              <input id="tags" className="input" value={form.reviewTags} onChange={set('reviewTags')} placeholder="comma, separated" />
            </div>
            <div className="field">
              <label htmlFor="subject">Subject (individual)</label>
              <input id="subject" className="input" value={form.subjectName} onChange={set('subjectName')} placeholder="Full name" />
            </div>
            <div className="field">
              <label htmlFor="direction">Transaction direction</label>
              <select id="direction" className="select" value={form.direction} onChange={set('direction')}>
                <option value="DEBIT">Debit (money out)</option>
                <option value="CREDIT">Credit (money in)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="amount">Transaction amount</label>
              <input id="amount" className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="e.g. 12500.00" />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <input id="currency" className="input" maxLength={8} value={form.currency} onChange={set('currency')} />
            </div>
          </div>

          {error && (
            <div className="errbox" style={{ marginTop: 18 }}>
              <strong>{error.title || 'Could not submit'}</strong>
              <div>{error.message}</div>
              {error.traceId && <div className="mono" style={{ marginTop: 4 }}>trace_id: {error.traceId}</div>}
            </div>
          )}

          <div className="actions" style={{ marginTop: 22 }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.rule.trim()}>
              {busy ? <Spinner /> : <Icon name="bolt" size={16} />} Send to Hummingbird
            </button>
            <button className="btn" type="button" onClick={() => { setForm(empty); setError(null) }} disabled={busy}>Reset</button>
          </div>
        </form>

        <div className="card card-pad tips">
          <div className="card-title">How it works</div>
          <ul>
            <li><b>Asynchronous.</b> The API only confirms receipt. Processing normally finishes within five minutes.</li>
            <li><b>Grouping.</b> If the subject already has an open case, the alert is grouped into it instead of opening a new one.</li>
            <li><b>Duplicates.</b> Re-sending a processed alert ID changes nothing; a dismissed ID is dismissed again.</li>
            <li><b>Stuck?</b> After three failed attempts an alert becomes “stuck”. Hummingbird support has to un-stick it.</li>
            <li><b>Sandbox only.</b> Don’t send real customer data to the sandbox.</li>
          </ul>
        </div>
      </div>
    </>
  )
}
