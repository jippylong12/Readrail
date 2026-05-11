import type { ReactNode } from 'react'

export type AppRoute =
  | 'library-import'
  | 'library-ocr'
  | 'library-saved'
  | 'library-document'
  | 'reader'
  | 'test'
  | 'progress'
  | 'stats'
  | 'settings'

export type PrimaryRoute = 'library-saved' | 'reader' | 'progress' | 'stats' | 'settings'

export type RouteState = {
  route: AppRoute
  documentId: string | null
  chapterId?: string | null
  pageNumber?: number | null
}

export type RouteDefinition = {
  id: PrimaryRoute
  label: string
  icon: ReactNode
}

export const DEFAULT_ROUTE: RouteState = {
  route: 'library-saved',
  documentId: null,
}

export const ROUTES: RouteDefinition[] = [
  { id: 'library-saved', label: 'Library', icon: 'L' },
  { id: 'reader', label: 'Reader', icon: 'R' },
  { id: 'progress', label: 'Progress', icon: 'P' },
  { id: 'stats', label: 'Stats', icon: 'S' },
  { id: 'settings', label: 'Settings', icon: 'G' },
]

export function routeFromPath(pathname: string): RouteState {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (segments[0] === 'library') {
    if (segments[1] === 'import') {
      return { route: 'library-import', documentId: null }
    }
    if (segments[1] === 'ocr') {
      return { route: 'library-ocr', documentId: null }
    }
    if (segments[1] === 'documents' && segments[2]) {
      const pageNumber = segments[5] === 'pages' && segments[6] ? Number(segments[6]) : null
      return {
        route: 'library-document',
        documentId: segments[2],
        chapterId: segments[3] === 'chapters' ? segments[4] ?? null : null,
        pageNumber: pageNumber !== null && Number.isFinite(pageNumber) ? Math.max(1, Math.round(pageNumber)) : null,
      }
    }
    return { route: 'library-saved', documentId: null }
  }

  if (segments[0] === 'reader') {
    return { route: 'reader', documentId: segments[1] ?? null }
  }

  if (segments[0] === 'test') {
    return { route: 'test', documentId: null }
  }

  if (segments[0] === 'progress') {
    return { route: 'progress', documentId: null }
  }

  if (segments[0] === 'stats') {
    return { route: 'stats', documentId: null }
  }

  if (segments[0] === 'settings') {
    return { route: 'settings', documentId: null }
  }

  return DEFAULT_ROUTE
}

export function pathForRoute(routeState: RouteState): string {
  switch (routeState.route) {
    case 'library-import':
      return '/library/import'
    case 'library-ocr':
      return '/library/ocr'
    case 'library-document':
      if (!routeState.documentId) {
        return '/library/saved'
      }
      if (routeState.chapterId) {
        const chapterPath = `/library/documents/${encodeURIComponent(routeState.documentId)}/chapters/${encodeURIComponent(routeState.chapterId)}`
        return routeState.pageNumber && routeState.pageNumber > 1
          ? `${chapterPath}/pages/${encodeURIComponent(routeState.pageNumber.toString())}`
          : chapterPath
      }
      return `/library/documents/${encodeURIComponent(routeState.documentId)}`
    case 'reader':
      return routeState.documentId ? `/reader/${encodeURIComponent(routeState.documentId)}` : '/reader'
    case 'test':
      return '/test'
    case 'progress':
      return '/progress'
    case 'stats':
      return '/stats'
    case 'settings':
      return '/settings'
    case 'library-saved':
    default:
      return '/library/saved'
  }
}

export function primaryRouteFor(route: AppRoute): PrimaryRoute {
  if (route === 'library-import' || route === 'library-ocr' || route === 'library-document') {
    return 'library-saved'
  }

  if (route === 'test') {
    return 'reader'
  }

  return route
}
