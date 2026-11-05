// Stand-in for the Spring Boot backend, for UI development without Java or Hummingbird credentials.
//   npm run mock        -> http://localhost:8080  (then `npm run dev`)
// Mimics the same /api contract. New alerts move PENDING -> PROCESSED (or STUCK) after ~20s, then their case
// outcome progresses (opened -> escalated -> filed / not_filed) so the whole journey can be demoed.
import http from 'node:http'

const PORT = Number(process.env.PORT || 8080)
let nextId = 1
const alerts = []
const events = []
const tok = (n = 24) => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join('')
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()

function addEvent(alertId, type, detail, at = new Date().toISOString()) {
  events.push({ id: events.length + 1, alertId, type, detail, at })
}

function seed(externalId, rule, minutesAgo, state, extra = {}) {
  const a = {
    id: nextId++, externalId, processingToken: tok(), alertToken: state === 'PROCESSED' ? tok() : null, rule,
    comments: extra.comments ?? null, triggeredAt: ago(minutesAgo + 5), reviewTags: extra.reviewTags ?? [],
    subjectName: extra.subjectName ?? null, amountMinor: extra.amountMinor ?? null, currency: extra.amountMinor ? 'USD' : null,
    state, caseToken: state === 'PROCESSED' ? tok() : null, reviewToken: state === 'PROCESSED' ? tok() : null,
    errorMessage: null, source: extra.source ?? 'CONSOLE', createdAt: ago(minutesAgo),
    processedAt: state === 'PROCESSED' ? ago(minutesAgo - 3) : null, lastCheckedAt: ago(1),
    outcome: extra.outcome ?? (state === 'PROCESSED' ? 'opened' : state === 'DISMISSED' ? 'dismissed' : null),
    filingStatus: extra.filingStatus ?? null, txCount: extra.amountMinor ? (extra.txCount ?? 1) : null,
  }
  alerts.push(a)
  addEvent(a.id, 'SUBMITTED', `Accepted by Hummingbird; processing token ${a.processingToken}`, a.createdAt)
  if (state === 'PROCESSED') addEvent(a.id, 'WEBHOOK', 'alert.processed', a.processedAt)
  if (state === 'STUCK') addEvent(a.id, 'POLLED', 'State is now STUCK', ago(minutesAgo - 20))
  return a
}

seed('ALR-7F3A91C2', 'Structuring: multiple cash deposits just under reporting threshold', 45, 'PROCESSED', { outcome: 'filed', filingStatus: 'accepted', txCount: 5, subjectName: 'Jordan A. Whitfield', amountMinor: 4875000, reviewTags: ['structuring', 'cash'], comments: 'Five cash deposits between $9,000 and $9,900 across three branches within 48 hours.' })
seed('ALR-22B0E4D1', 'Rapid in/out: funds withdrawn within 24h of deposit', 130, 'PROCESSED', { outcome: 'escalated', txCount: 3, subjectName: 'Northwind Trading LLC', amountMinor: 12000000, reviewTags: ['rapid-movement', 'wire'] })
seed('ALR-91CD5502', 'High-risk counterparty: crypto exchange off-ramp', 300, 'PROCESSED', { outcome: 'not_filed', subjectName: 'Maria Kovalenko', amountMinor: 1550000, reviewTags: ['crypto', 'high-risk'] })
seed('ALR-5A8E77F0', 'Unusual geography: login and card use in different countries', 1500, 'PROCESSED', { outcome: 'not_filed', subjectName: 'Daniel Okafor', amountMinor: 89900 })
seed('ALR-C04412AB', 'Dormant account reactivated with large inbound wire', 2900, 'PROCESSED', { outcome: 'filed', filingStatus: 'accepted', subjectName: 'Harbor Light Foundation', amountMinor: 25000000, reviewTags: ['dormant'] })
seed('ALR-B77D01E9', 'Round-amount transfers to multiple new payees', 4200, 'STUCK', { subjectName: 'Lena Fischer', amountMinor: 500000, reviewTags: ['new-payees'] })
seed('ALR-1E9F6A33', 'Velocity: 14 card transactions in 10 minutes', 4300, 'DISMISSED', { subjectName: 'Tomás Rivera', amountMinor: 31200 })
seed('ALR-E5510C7D', 'Sanctions screening near-match', 7000, 'PROCESSED', { source: 'WEBHOOK' })
seed('ALR-3D2A8B64', 'Cash-intensive business with atypical deposit pattern', 8700, 'PROCESSED', { subjectName: 'Golden Wok Restaurants Inc.', amountMinor: 6720000, reviewTags: ['cash'] })
seed('ALR-A6F0B918', 'Third-party funding of loan repayment', 12, 'PENDING', { subjectName: 'Priya Raman', amountMinor: 210000 })

// ---- demo scenarios (mirror ScenarioService / MonitoringRules in the Java backend)
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString()
const T = (id, description, amountMinor, direction, channel, h) => ({ id, description, amountMinor, direction, channel, at: hoursAgo(h) })
const money = (m) => '$' + (m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const SCENARIOS = {
  normal: { key: 'normal', title: 'Normal deposit and withdrawal', summary: 'Anna\u2019s salary arrives and she withdraws some cash. Nothing unusual, so nothing is sent.', suspicious: false, customer: 'Anna Cohen', avg: 300000,
    txs: [T('N-1', 'Salary deposit', 250000, 'CREDIT', 'WIRE', 6), T('N-2', 'ATM cash withdrawal', 30000, 'DEBIT', 'CASH', 2)] },
  false_alarm: { key: 'false_alarm', title: 'False alarm: large but legitimate wire', summary: 'Anna receives $18,000 from the sale of her flat. A rule fires, but the investigator finds it legitimate.', suspicious: false, customer: 'Anna Cohen', avg: 300000,
    txs: [T('F-1', 'Incoming wire (property sale proceeds)', 1800000, 'CREDIT', 'WIRE', 1)] },
  structuring: { key: 'structuring', title: 'Suspicious: structuring then wire out', summary: 'Five cash deposits just under $10,000 over two days, then almost all of it wired to a new overseas account.', suspicious: true, customer: 'Mark Dalton', avg: 200000,
    txs: [T('S-1', 'Cash deposit, Branch 1', 940000, 'CREDIT', 'CASH', 30), T('S-2', 'Cash deposit, Branch 2', 910000, 'CREDIT', 'CASH', 26), T('S-3', 'Cash deposit, Branch 1', 970000, 'CREDIT', 'CASH', 20),
          T('S-4', 'Cash deposit, Branch 3', 930000, 'CREDIT', 'CASH', 8), T('S-5', 'Cash deposit, Branch 3', 990000, 'CREDIT', 'CASH', 4), T('S-6', 'Outbound wire to new overseas account', 4600000, 'DEBIT', 'WIRE', 1)] },
}
function evaluate(txs, avg) {
  const dep = txs.filter((t) => t.direction === 'CREDIT' && t.channel === 'CASH' && t.amountMinor >= 900000 && t.amountMinor < 1000000)
  if (dep.length >= 3) return { rule: 'Structuring: multiple cash deposits just under reporting threshold', comments: `${dep.length} cash deposits between $9,000 and $9,999 within 48 hours, totalling ${money(dep.reduce((n, t) => n + t.amountMinor, 0))}.`, tags: ['structuring', 'cash'] }
  const w = txs.find((t) => t.direction === 'CREDIT' && t.channel === 'WIRE' && t.amountMinor >= 1000000 && t.amountMinor >= 5 * avg)
  return w ? { rule: 'Inbound wire far above customer monthly volume', comments: `${money(w.amountMinor)} inbound wire vs. typical ${money(avg)} per month.`, tags: ['wire', 'volume-spike'] } : null
}

// ---- simulate Hummingbird's async processing
setInterval(() => {
  for (const a of alerts) {
    if (a.state === 'PENDING' && a.source === 'CONSOLE' && Date.now() - new Date(a.createdAt).getTime() > 20000 && a.id > 10) {
      a.state = a.externalId.toUpperCase().includes('STUCK') ? 'STUCK' : 'PROCESSED'
      if (a.state === 'PROCESSED') {
        a.caseToken = tok(); a.reviewToken = tok(); a.alertToken = tok(); a.processedAt = new Date().toISOString(); a.outcome = 'processed'
        addEvent(a.id, 'WEBHOOK', 'alert.processed')
      } else addEvent(a.id, 'WEBHOOK', 'alert.stuck')
    }
  }
}, 2000)

// ---- simulate the investigator + filing after processing (only for alerts created in this session)
const sinceProcessed = (a) => (a.processedAt ? Date.now() - new Date(a.processedAt).getTime() : 0)
setInterval(() => {
  for (const a of alerts) {
    if (a.state !== 'PROCESSED' || a.id <= 10 || ['filed', 'not_filed', 'dismissed'].includes(a.outcome)) continue
    const t = sinceProcessed(a)
    const suspicious = /structuring/i.test(a.rule)
    const next = t > 40000 ? (suspicious ? 'filed' : 'not_filed') : t > 20000 && suspicious ? 'escalated' : t > 5000 ? 'opened' : a.outcome
    if (next !== a.outcome) {
      addEvent(a.id, 'OUTCOME', `${a.outcome ?? 'processed'} → ${next}`)
      a.outcome = next
    }
  }
  for (const a of alerts) {
    if (a.outcome === 'filed' && !a.filingStatus && a.id > 10 && sinceProcessed(a) > 52000) {
      a.filingStatus = 'accepted'
      addEvent(a.id, 'WEBHOOK', 'Filing status: accepted')
    }
  }
}, 2000)

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const problem = (res, status, title, detail, extra = {}) => json(res, status, { title, detail, status, ...extra })

function stats() {
  const byState = { PENDING: 0, PROCESSED: 0, ERROR: 0, STUCK: 0, DISMISSED: 0, SUPPRESSED: 0 }
  alerts.forEach((a) => byState[a.state]++)
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days.push({ date: d, count: alerts.filter((a) => a.createdAt.slice(0, 10) === d).length })
  }
  const done = alerts.filter((a) => a.processedAt)
  const avg = done.length ? done.reduce((s, a) => s + (new Date(a.processedAt) - new Date(a.createdAt)) / 1000, 0) / done.length : null
  const byOutcome = {}
  alerts.forEach((a) => { if (a.outcome) byOutcome[a.outcome] = (byOutcome[a.outcome] || 0) + 1 })
  return { total: alerts.length, byState, byOutcome, last14Days: days, avgProcessingSeconds: avg }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  let body = ''
  for await (const c of req) body += c
  const payload = body ? JSON.parse(body) : null
  let m

  if (path === '/api/config') return json(res, 200, { baseUrl: 'https://api.sandbox.hummingbird.co', sandbox: true, credentialsConfigured: true, webhookSecretConfigured: false, apiVersion: '2026-02-05', dashboardUrl: 'https://sandbox.hummingbird.co' })
  if (path === '/api/stats') return json(res, 200, stats())

  if (path === '/api/alerts' && req.method === 'GET') {
    const state = (url.searchParams.get('state') || 'ALL').toUpperCase()
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const outcome = url.searchParams.get('outcome') || ''
    const page = Number(url.searchParams.get('page') || 0), size = Number(url.searchParams.get('size') || 20)
    let list = alerts.filter((a) => (state === 'ALL' || a.state === state) && (!outcome || a.outcome === outcome) &&
      (!q || [a.externalId, a.rule, a.subjectName, a.caseToken].some((v) => (v || '').toLowerCase().includes(q))))
    list = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return json(res, 200, { items: list.slice(page * size, page * size + size), page, size, totalItems: list.length, totalPages: Math.ceil(list.length / size) })
  }

  if (path === '/api/alerts' && req.method === 'POST') {
    if (!payload?.rule) return problem(res, 400, 'Validation failed', 'rule must not be blank')
    const externalId = payload.id || `ALR-${tok(8).toUpperCase()}`
    if (alerts.some((a) => a.externalId === externalId)) return problem(res, 409, 'Duplicate alert id', `An alert with id '${externalId}' already exists.`)
    const a = {
      id: nextId++, externalId, processingToken: tok(), alertToken: null, rule: payload.rule, comments: payload.comments || null,
      triggeredAt: new Date().toISOString(), reviewTags: payload.reviewTags || [], subjectName: payload.subjectName || null,
      amountMinor: payload.amountMinor ?? null, currency: payload.currency || null, state: 'PENDING', caseToken: null, reviewToken: null,
      errorMessage: null, source: 'CONSOLE', createdAt: new Date().toISOString(), processedAt: null, lastCheckedAt: null,
      outcome: null, filingStatus: null, txCount: payload.amountMinor != null ? 1 : null,
    }
    alerts.push(a)
    addEvent(a.id, 'SUBMITTED', `Accepted by Hummingbird; processing token ${a.processingToken}`)
    return json(res, 201, a)
  }

  if (path === '/api/scenarios' && req.method === 'GET') return json(res, 200, Object.values(SCENARIOS).map(({ key, title, summary, suspicious, txs, avg }) => ({ key, title, summary, suspicious, sendsAlert: !!evaluate(txs, avg) })))
  if ((m = path.match(/^\/api\/scenarios\/(\w+)\/run$/)) && req.method === 'POST') {
    const sc = SCENARIOS[m[1]]
    if (!sc) return problem(res, 404, 'Not Found', `Unknown scenario '${m[1]}'`)
    const hit = evaluate(sc.txs, sc.avg)
    const view = { key: sc.key, title: sc.title, customer: sc.customer, customerAvgMonthlyInboundMinor: sc.avg, transactions: sc.txs.map((t) => ({ ...t, currency: 'USD' })) }
    if (!hit) return json(res, 200, { ...view, alertSent: false, ruleFired: null, explanation: 'No monitoring rule fired, so nothing is sent to Hummingbird. Clean activity stays in the bank\u2019s own systems.', alert: null })
    const sent = sc.key === 'structuring' ? sc.txs : sc.txs.filter((t) => t.channel === 'WIRE' && t.direction === 'CREDIT')
    const a = {
      id: nextId++, externalId: `ALR-${tok(8).toUpperCase()}`, processingToken: tok(), alertToken: null, rule: hit.rule, comments: hit.comments,
      triggeredAt: new Date().toISOString(), reviewTags: hit.tags, subjectName: sc.customer, amountMinor: sent.reduce((n, t) => n + t.amountMinor, 0),
      currency: 'USD', state: 'PENDING', caseToken: null, reviewToken: null, errorMessage: null, source: 'CONSOLE', createdAt: new Date().toISOString(),
      processedAt: null, lastCheckedAt: null, outcome: null, filingStatus: null, txCount: sent.length,
    }
    alerts.push(a)
    addEvent(a.id, 'SUBMITTED', `Accepted by Hummingbird; processing token ${a.processingToken}; ${sent.length} transaction(s)`)
    return json(res, 200, { ...view, alertSent: true, ruleFired: hit.rule, explanation: `Rule fired \u2192 alert sent to Hummingbird with ${sent.length} transaction(s). Watch it move from pending to processed, then to its final outcome.`, alert: a })
  }

  if (path === '/api/alerts/refresh-pending') {
    const pend = alerts.filter((a) => a.state === 'PENDING')
    pend.forEach((a) => (a.lastCheckedAt = new Date().toISOString()))
    return json(res, 200, { checked: pend.length, changed: 0, failed: 0 })
  }

  if ((m = path.match(/^\/api\/alerts\/(\d+)(\/refresh|\/lifecycle)?$/))) {
    const a = alerts.find((x) => x.id === Number(m[1]))
    if (!a) return problem(res, 404, 'Not Found', `Alert ${m[1]} not found`)
    if (!m[2] && req.method === 'GET') return json(res, 200, { alert: a, events: events.filter((e) => e.alertId === a.id).sort((x, y) => y.at.localeCompare(x.at)) })
    if (!m[2] && req.method === 'DELETE') { alerts.splice(alerts.indexOf(a), 1); return json(res, 204) }
    if (m[2] === '/refresh') { a.lastCheckedAt = new Date().toISOString(); return json(res, 200, a) }
    if (m[2] === '/lifecycle') {
      return json(res, 200, { case_alert: { outcome: 'opened', group_id: 4821, id: a.externalId, lifecycle_events: [
        { timestamp: a.processedAt, event: 'processed', review_type_name: 'Triage' },
        { timestamp: a.processedAt, event: 'opened', review_type_name: 'Triage', actor: { full_name: 'Sam Reviewer' } },
      ] } })
    }
  }
  problem(res, 404, 'Not Found', `${req.method} ${path}`)
})

server.listen(PORT, () => console.log(`Mock Alerts API on http://localhost:${PORT}`))
