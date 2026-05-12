import type { ReactNode } from 'react'
import type { ReadingScopeType } from '../types/domain'

export type AppRoute =
  | 'library-import'
  | 'library-ocr'
  | 'library-saved'
  | 'library-document'
  | 'library-page'
  | 'reader'
  | 'test'
  | 'progress'
  | 'costs'
  | 'stats'
  | 'settings'

export type PrimaryRoute = 'library-saved' | 'reader' | 'progress' | 'costs' | 'stats' | 'settings'

export type RouteState = {
  route: AppRoute
  documentId: string | null
  ocrJobId?: string | null
  chapterId?: string | null
  readerScopeType?: ReadingScopeType | null
  pageId?: string | null
  pageNumber?: number | null
  startPageNumber?: number | null
  endPageNumber?: number | null
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
  { id: 'costs', label: 'Costs', icon: '$' },
  { id: 'stats', label: 'Stats', icon: 'S' },
  { id: 'settings', label: 'Settings', icon: 'G' },
]

export function routeFromPath(pathname: string): RouteState {
  const [path, query = ''] = pathname.split('?')
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent)
  const searchParams = new URLSearchParams(query)

  if (segments[0] === 'library') {
    if (segments[1] === 'manual' || segments[1] === 'import') {
      return { route: 'library-import', documentId: null }
    }
    if (segments[1] === 'ocr') {
      return { route: 'library-ocr', documentId: null }
    }
    if (segments[1] === 'documents' && segments[2]) {
      if (segments[3] === 'pages' && segments[4]) {
        return {
          route: 'library-page',
          documentId: segments[2],
          pageId: segments[4],
        }
      }
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
    const startPageNumber = segments[4] === 'pages' && segments[5] ? Number(segments[5]) : null
    const endPageNumber = segments[4] === 'pages' && segments[6] ? Number(segments[6]) : startPageNumber
    return {
      route: 'reader',
      documentId: segments[1] ?? null,
      chapterId: segments[2] === 'chapters' ? segments[3] ?? null : null,
      ...(searchParams.get('scope') === 'document' ? { readerScopeType: 'document' as const } : {}),
      startPageNumber:
        startPageNumber !== null && Number.isFinite(startPageNumber) ? Math.max(1, Math.round(startPageNumber)) : null,
      endPageNumber:
        endPageNumber !== null && Number.isFinite(endPageNumber) ? Math.max(1, Math.round(endPageNumber)) : null,
    }
  }

  if (segments[0] === 'test') {
    return { route: 'test', documentId: null }
  }

  if (segments[0] === 'progress') {
    return { route: 'progress', documentId: null }
  }

  if (segments[0] === 'costs') {
    return {
      route: 'costs',
      documentId: searchParams.get('documentId'),
      ocrJobId: searchParams.get('ocrJobId'),
    }
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
      return '/library/manual'
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
    case 'library-page':
      if (!routeState.documentId || !routeState.pageId) {
        return routeState.documentId
          ? `/library/documents/${encodeURIComponent(routeState.documentId)}`
          : '/library/saved'
      }
      return `/library/documents/${encodeURIComponent(routeState.documentId)}/pages/${encodeURIComponent(routeState.pageId)}`
    case 'reader':
      if (!routeState.documentId) {
        return '/reader'
      }
      if (routeState.chapterId) {
        const chapterPath = `/reader/${encodeURIComponent(routeState.documentId)}/chapters/${encodeURIComponent(routeState.chapterId)}`
        if (routeState.startPageNumber) {
          const endPageNumber = routeState.endPageNumber ?? routeState.startPageNumber
          return `${chapterPath}/pages/${encodeURIComponent(routeState.startPageNumber.toString())}/${encodeURIComponent(endPageNumber.toString())}`
        }
        return chapterPath
      }
      return routeState.readerScopeType === 'document'
        ? `/reader/${encodeURIComponent(routeState.documentId)}?scope=document`
        : `/reader/${encodeURIComponent(routeState.documentId)}`
    case 'test':
      return '/test'
    case 'progress':
      return '/progress'
    case 'costs':
      return costPath(routeState)
    case 'stats':
      return '/stats'
    case 'settings':
      return '/settings'
    case 'library-saved':
    default:
      return '/library/saved'
  }
}

function costPath(routeState: RouteState): string {
  const searchParams = new URLSearchParams()
  if (routeState.documentId) {
    searchParams.set('documentId', routeState.documentId)
  }
  if (routeState.ocrJobId) {
    searchParams.set('ocrJobId', routeState.ocrJobId)
  }
  const query = searchParams.toString()
  return query ? `/costs?${query}` : '/costs'
}

export function primaryRouteFor(route: AppRoute): PrimaryRoute {
  if (route === 'library-import' || route === 'library-ocr' || route === 'library-document' || route === 'library-page') {
    return 'library-saved'
  }

  if (route === 'test') {
    return 'reader'
  }

  return route
}
