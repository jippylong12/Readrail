import type { AppRoute } from './routes'

export type RouteShortcut = {
  route: AppRoute
  key: string
  display: string
  title: string
  ariaKeyShortcuts: string
}

export const ROUTE_SHORTCUTS: RouteShortcut[] = [
  {
    route: 'library',
    key: 'l',
    display: '⌘L',
    title: 'Library (Command+L / Control+L)',
    ariaKeyShortcuts: 'Meta+L Control+L',
  },
  {
    route: 'reader',
    key: 'r',
    display: '⌘R',
    title: 'Reader (Command+R / Control+R)',
    ariaKeyShortcuts: 'Meta+R Control+R',
  },
  {
    route: 'progress',
    key: 'p',
    display: '⌘P',
    title: 'Progress (Command+P / Control+P)',
    ariaKeyShortcuts: 'Meta+P Control+P',
  },
  {
    route: 'stats',
    key: 's',
    display: '⌘S',
    title: 'Stats (Command+S / Control+S)',
    ariaKeyShortcuts: 'Meta+S Control+S',
  },
  {
    route: 'settings',
    key: 'g',
    display: '⌘G',
    title: 'Settings (Command+G / Control+G)',
    ariaKeyShortcuts: 'Meta+G Control+G',
  },
]

export function getShortcutForRoute(route: AppRoute): RouteShortcut | undefined {
  return ROUTE_SHORTCUTS.find((shortcut) => shortcut.route === route)
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true' ||
    target.closest('[contenteditable="true"], [role="textbox"]')
  ) {
    return true
  }

  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

export function getRouteForShortcutEvent(event: KeyboardEvent): AppRoute | null {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.shiftKey ||
    event.metaKey === event.ctrlKey ||
    isEditableShortcutTarget(event.target)
  ) {
    return null
  }

  const shortcut = ROUTE_SHORTCUTS.find((candidate) => candidate.key === event.key.toLowerCase())
  return shortcut?.route ?? null
}
