import { createContext, useCallback, useContext, useState } from 'react'

// ---------------------------------------------------------------- formatting

export const STATES = ['PENDING', 'PROCESSED', 'STUCK', 'ERROR', 'DISMISSED', 'SUPPRESSED']

export const STATE_META = {
  PENDING: { label: 'Pending', hint: 'Accepted by Hummingbird, waiting to be processed' },
  PROCESSED: { label: 'Processed', hint: 'Turned into / grouped into a case and review' },
  STUCK: { label: 'Stuck', hint: 'Failed 3 processing attempts - contact Hummingbird support' },
  ERROR: { label: 'Error', hint: 'Processing error' },
  DISMISSED: { label: 'Dismissed', hint: 'Dismissed, will not become a case' },
  SUPPRESSED: { label: 'Suppressed', hint: 'Suppressed by a rule' },
}

// Outcome of the case an alert ended up in (Hummingbird "case alert" lifecycle)
export const OUTCOMES = ['opened', 'escalated', 'filed', 'not_filed', 'dismissed']
export const OUTCOME_META = {
  processed: { label: 'Processed', hint: 'Processed and ready to be worked on' },
  opened: { label: 'In review', hint: 'The alert is ready to be worked on / being reviewed' },
  escalated: { label: 'Escalated', hint: 'Escalated for a further decision' },
  filed: { label: 'Filed', hint: 'A report was filed with the regulator' },
  not_filed: { label: 'Not filed', hint: 'Reviewed; no report was needed' },
  dismissed: { label: 'Dismissed', hint: 'Dismissed, will not be escalated further' },
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export function formatMoney(minor, currency) {
  if (minor == null) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency || ''}`
  }
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 90) return `${Math.round(seconds)} s`
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

// ---------------------------------------------------------------- icons

const paths = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 00-14.9-3M4 4v4h4M4 13a8 8 0 0014.9 3M20 20v-4h-4',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12l5 5L20 7',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  flow: 'M6 5a2 2 0 100 4 2 2 0 000-4zM18 15a2 2 0 100 4 2 2 0 000-4zM8 7h4a3 3 0 013 3v3M15 17',
  play: 'M7 4l13 8-13 8z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
}

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

// ---------------------------------------------------------------- small components

export function StateBadge({ state }) {
  const meta = STATE_META[state] || { label: state, hint: '' }
  return (
    <span className={`badge badge-${state?.toLowerCase()}`} title={meta.hint}>
      <span className="dot" />
      {meta.label}
    </span>
  )
}

export function OutcomeBadge({ outcome }) {
  if (!outcome) return <span className="muted">—</span>
  const meta = OUTCOME_META[outcome] || { label: outcome, hint: '' }
  return (
    <span className={`badge badge-o-${outcome}`} title={meta.hint}>
      <span className="dot" />
      {meta.label}
    </span>
  )
}

export function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="copyfield">
      <span className="copyfield-label">{label}</span>
      <code>{value}</code>
      <button className="icon-btn" onClick={copy} title="Copy" aria-label={`Copy ${label}`}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />
      </button>
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />
}

// ---------------------------------------------------------------- toasts

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'info', detail) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, kind, detail }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 3800)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <strong>{t.message}</strong>
            {t.detail && <span>{t.detail}</span>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
