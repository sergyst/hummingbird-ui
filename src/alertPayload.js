// Turns the "New alert" form state into the body of POST /api/alerts (kept free of React so it is easy to test).

// Allowed values of data.crypto_addresses[].blockchain in the Hummingbird API reference.
export const BLOCKCHAINS = ['ETHEREUM', 'BITCOIN', 'BITCOIN_CASH', 'LITECOIN', 'RIPPLE', 'CARDANO', 'EOS', 'MONERO', 'OTHER', 'UNKNOWN']

// Instructions for hummingbird-mock (GET /mock/directives). They are appended to the alert's comments.
export const SIMULATIONS = [
  { value: '', label: 'None (normal processing)' },
  { value: 'fail', label: 'Fail the alert (state: error)', directive: () => 'mock:fail' },
  { value: 'error', label: 'Fail with a custom message…', arg: { label: 'Error message', placeholder: 'bad entity data', initial: 'simulated failure' },
    directive: (a) => `mock:error=${a.trim().replace(/\s+/g, '_')}` },
  { value: 'stuck', label: 'Get stuck', directive: () => 'mock:stuck' },
  { value: 'dismissed', label: 'Be dismissed', directive: () => 'mock:dismissed' },
  { value: 'suppressed', label: 'Be suppressed', directive: () => 'mock:suppressed' },
  { value: 'escalated', label: 'Process, then stop at escalated', directive: () => 'mock:escalated' },
  { value: 'filed', label: 'Process, escalate and file', directive: () => 'mock:filed' },
  { value: 'filing_rejected', label: 'File, but the filing is rejected', directive: () => 'mock:filing_rejected' },
  { value: 'not_filed', label: 'Process, then not filed', directive: () => 'mock:not_filed' },
  { value: 'delay', label: 'Slow processing…', arg: { label: 'Delay', placeholder: '45s, 2m or PT30S', initial: '30s' },
    directive: (a) => `mock:delay=${a.trim()}` },
  { value: 'http', label: 'Reject the request with an HTTP error…', arg: { label: 'HTTP status', placeholder: '503', initial: '503' },
    directive: (a) => `mock:http=${a.trim()}` },
]

/** The directive text for a chosen simulation (empty when none). */
export function directiveFor(simulate, arg) {
  const sim = SIMULATIONS.find((s) => s.value === simulate)
  if (!sim || !sim.directive) return ''
  if (sim.arg && !String(arg ?? '').trim()) throw new Error(`${sim.arg.label} is required for “${sim.label}”`)
  return sim.directive(arg ?? '')
}

/** Simulation controls only make sense against a local mock server. */
export function isLocalBackend(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

export const emptyForm = {
  id: '', rule: '', comments: '', reviewTags: '', subjectName: '', amount: '', currency: 'USD', direction: 'DEBIT',
  workflow: 'triage', cryptoAddresses: [], otherInfo: [], simulate: '', simulateArg: '',
}

/** Throws an Error with a user-facing message when the form is not valid. */
export function buildAlertPayload(form) {
  const amountMinor = form.amount.trim() === '' ? null : Math.round(parseFloat(form.amount) * 100)
  if (amountMinor != null && (Number.isNaN(amountMinor) || amountMinor < 0)) throw new Error('Amount must be a positive number')

  const cryptoAddresses = []
  form.cryptoAddresses.forEach((c, i) => {
    const address = c.address.trim()
    if (!address && !c.id.trim()) return // an untouched row
    if (!address) throw new Error(`Crypto address #${i + 1}: the address is required`)
    if (!c.blockchain) throw new Error(`Crypto address #${i + 1}: choose a blockchain`)
    cryptoAddresses.push({ id: c.id.trim() || null, address, blockchain: c.blockchain })
  })

  const otherInfo = []
  form.otherInfo.forEach((o, i) => {
    const label = o.label.trim()
    const value = o.value.trim()
    if (!label && !value) return
    if (!label || !value) throw new Error(`Other info #${i + 1}: both label and value are required`)
    otherInfo.push({ label, value })
  })

  const directive = directiveFor(form.simulate, form.simulateArg)
  const comments = [form.comments.trim(), directive].filter(Boolean).join(' ')

  return {
    id: form.id.trim() || null,
    rule: form.rule.trim(),
    comments: comments || null,
    reviewTags: form.reviewTags.split(',').map((t) => t.trim()).filter(Boolean),
    subjectName: form.subjectName.trim() || null,
    amountMinor,
    currency: amountMinor != null ? form.currency.trim() || 'USD' : null,
    direction: form.direction,
    workflow: form.workflow.trim() || null,
    cryptoAddresses,
    otherInfo,
  }
}
