import type { AppRoute } from '../app/routes'
import { ROUTES } from '../app/routes'
import type { DocumentRecord } from '../types/domain'

type AppShellProps = {
  activeRoute: AppRoute
  activeDocument: DocumentRecord | null
  onRouteChange: (route: AppRoute) => void
  onReplayTour: () => void
  children: React.ReactNode
}

export function AppShell({ activeRoute, activeDocument, onRouteChange, onReplayTour, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>Readrail</strong>
            <span>Evidence-aware reading</span>
          </div>
        </div>

        <nav className="nav-tabs">
          {ROUTES.map((route) => (
            <button
              className={route.id === activeRoute ? 'nav-tab active' : 'nav-tab'}
              key={route.id}
              onClick={() => onRouteChange(route.id)}
              type="button"
            >
              <span aria-hidden="true">{route.icon}</span>
              {route.label}
            </button>
          ))}
        </nav>

        <div className="session-card">
          <span className="eyebrow">Current</span>
          <strong>{activeDocument?.title ?? 'No document selected'}</strong>
          <span>{activeDocument ? `${activeDocument.wordCount.toLocaleString()} words` : 'Import text to begin'}</span>
        </div>

        <button className="secondary-button help-button" onClick={onReplayTour} type="button">
          Replay walkthrough
        </button>
      </aside>

      <main className="main-panel">{children}</main>
    </div>
  )
}
