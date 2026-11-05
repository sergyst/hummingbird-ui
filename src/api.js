// Tiny fetch wrapper for this app's own REST API (the Spring Boot server).

export class ApiError extends Error {
  constructor(message, { status, title, traceId, code } = {}) {
    super(message)
    this.status = status
    this.title = title
    this.traceId = traceId
    this.code = code
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the backend. Is the Spring Boot server running on :8080?', { status: 0 })
  }
  if (res.status === 204) return null
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    // Spring ProblemDetail: { title, detail, traceId, code }
    throw new ApiError(data?.detail || data?.message || `Request failed (${res.status})`, {
      status: res.status,
      title: data?.title,
      traceId: data?.traceId,
      code: data?.code,
    })
  }
  return data
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  config: () => request('GET', '/config'),
  stats: () => request('GET', '/stats'),
  listAlerts: ({ state = 'ALL', q = '', outcome = '', page = 0, size = 15 } = {}) =>
    request('GET', `/alerts?${new URLSearchParams({ state, q, outcome, page, size })}`),
  getAlert: (id) => request('GET', `/alerts/${id}`),
  submitAlert: (payload) => request('POST', '/alerts', payload),
  refreshAlert: (id) => request('POST', `/alerts/${id}/refresh`),
  refreshPending: () => request('POST', '/alerts/refresh-pending'),
  lifecycle: (id) => request('GET', `/alerts/${id}/lifecycle`),
  deleteAlert: (id) => request('DELETE', `/alerts/${id}`),
  scenarios: () => request('GET', '/scenarios'),
  runScenario: (key) => request('POST', `/scenarios/${key}/run`),
}
