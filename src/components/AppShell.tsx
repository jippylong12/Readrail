import type { PrimaryRoute } from '../app/routes'
import { ROUTES } from '../app/routes'
import { getShortcutForRoute } from '../app/shortcuts'
import type { DocumentRecord } from '../types/domain'

type AppShellProps = {
  activeRoute: PrimaryRoute
  activeDocument: DocumentRecord | null
  onRouteChange: (route: PrimaryRoute) => void
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
          {ROUTES.map((route) => {
            const shortcut = getShortcutForRoute(route.id)

            return (
              <button
                aria-keyshortcuts={shortcut?.ariaKeyShortcuts}
                className={route.id === activeRoute ? 'nav-tab active' : 'nav-tab'}
                key={route.id}
                onClick={() => onRouteChange(route.id)}
                title={shortcut?.title}
                type="button"
              >
                <span className="nav-tab-label">{route.label}</span>
                {shortcut && (
                  <span aria-hidden="true" className="shortcut-hint">
                    {shortcut.display}
                  </span>
                )}
              </button>
            )
          })}
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
