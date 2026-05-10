import type { ReactNode } from 'react'

export type AppRoute = 'library' | 'reader' | 'stats' | 'settings'

export type RouteDefinition = {
  id: AppRoute
  label: string
  icon: ReactNode
}

export const ROUTES: RouteDefinition[] = [
  { id: 'library', label: 'Library', icon: 'L' },
  { id: 'reader', label: 'Reader', icon: 'R' },
  { id: 'stats', label: 'Stats', icon: 'S' },
  { id: 'settings', label: 'Settings', icon: 'G' },
]
