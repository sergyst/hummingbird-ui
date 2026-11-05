import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Icon, ToastProvider } from './ui'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import SubmitAlert from './pages/SubmitAlert'
import Scenarios from './pages/Scenarios'
import AlertDrawer from './pages/AlertDrawer'

// Minimal hash router: #/  #/alerts  #/alerts/12  #/new
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const goto = useCallback((to) => { window.location.hash = to }, [])
  return [route, goto]
}

export default function App() {
  const [route, goto] = useRoute()
  const [config, setConfig] = useState(null)
  const [offline, setOffline] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pending, setPending] = useState(0)

  const bump = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    api.config().then((c) => { setConfig(c); setOffline(false) }).catch(() => setOffline(true))
  }, [])

  useEffect(() => {
    let alive = true
    const tick = () => api.stats().then((s) => alive && (setPending(s.byState.PENDING || 0), setOffline(false))).catch(() => alive && setOffline(true))
    tick()
    const t = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [reloadKey])

  const drawerMatch = route.match(/^\/alerts\/(\d+)$/)
  const drawerId = drawerMatch ? Number(drawerMatch[1]) : null
  const section = route.startsWith('/alerts') ? 'alerts' : route.startsWith('/new') ? 'new' : route.startsWith('/scenarios') ? 'scenarios' : 'overview'
  const openAlert = (id) => goto(`/alerts/${id}`)
  const closeDrawer = () => goto(section === 'alerts' ? '/alerts' : '/')

  return (
    <ToastProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l5-9 3.5 6 2.5-4 5 7" /></svg>
            </div>
            <div>Alerts Console<small>for Hummingbird</small></div>
          </div>
          <nav className="nav">
            <a href="#/" className={section === 'overview' ? 'active' : ''}><Icon name="grid" /> Overview</a>
            <a href="#/alerts" className={section === 'alerts' ? 'active' : ''}>
              <Icon name="bell" /> Alerts {pending > 0 && <span className="count" title="Awaiting processing">{pending}</span>}
            </a>
            <a href="#/scenarios" className={section === 'scenarios' ? 'active' : ''}><Icon name="play" /> Scenarios</a>
            <a href="#/new" className={section === 'new' ? 'active' : ''}><Icon name="plus" /> New alert</a>
          </nav>
          <div className="sidebar-foot">
            {config && (
              <span className={`env-pill ${config.sandbox ? 'env-sandbox' : 'env-prod'}`}>
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {config.sandbox ? 'Sandbox' : 'Production'}
              </span>
            )}
            <div style={{ marginTop: 8 }}>API version {config?.apiVersion || '—'}</div>
          </div>
        </aside>

        <main className="main">
          {offline && (
            <div className="banner banner-warn">
              <Icon name="alert" />
              <div>
                <strong>Can’t reach the backend</strong>
                <p>Start the Spring Boot server (<code>mvn spring-boot:run</code> in <code>backend/</code>) on port 8080.</p>
              </div>
            </div>
          )}

          {section === 'overview' && <Dashboard config={config} onOpenAlert={openAlert} goto={goto} reloadKey={reloadKey} />}
          {section === 'alerts' && <Alerts onOpenAlert={openAlert} goto={goto} reloadKey={reloadKey} onChanged={bump} />}
          {section === 'new' && <SubmitAlert config={config} goto={goto} onChanged={bump} />}
          {section === 'scenarios' && <Scenarios config={config} goto={goto} onChanged={bump} />}
        </main>

        {drawerId && <AlertDrawer id={drawerId} config={config} onClose={closeDrawer} onChanged={bump} />}
      </div>
    </ToastProvider>
  )
}
