// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { pathForRoute, routeFromPath } from '../app/routes'
import { getRouteForShortcutEvent, isEditableShortcutTarget } from '../app/shortcuts'
import { createDefaultDocumentStructure } from '../app/structuredDocuments'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

const activeDocument: DocumentRecord = {
  id: 'document-1',
  title: 'Shortcut test document',
  sourceType: 'paste',
  content: 'Keyboard navigation should move through each primary Readrail section.',
  wordCount: 9,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archivedAt: null,
}

function resetStore(): void {
  const structure = createDefaultDocumentStructure(activeDocument)
  useAppStore.setState({
    documents: [activeDocument],
    documentChapters: [structure.chapter],
    documentPages: [structure.page],
    ocrJobs: [],
    ocrJobItems: [],
    ocrRuntimeJobs: {},
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: new Date().toISOString(),
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'stats', 'settings'],
    },
    baselineResult: null,
  })
}

function buildChapter(id: string, title: string, sortOrder: number): DocumentChapterRecord {
  return {
    id,
    documentId: activeDocument.id,
    title,
    sortOrder,
    createdAt: activeDocument.createdAt,
    updatedAt: activeDocument.updatedAt,
  }
}

function buildPage(chapterId: string, pageNumber: number, sortOrder: number, title: string): DocumentPageRecord {
  return {
    id: `page-${chapterId}-${pageNumber}`,
    documentId: activeDocument.id,
    chapterId,
    sortOrder,
    pageNumber,
    sourcePageNumber: pageNumber,
    title,
    text: `${title} text.`,
    wordCount: 3,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: null,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: activeDocument.createdAt,
    updatedAt: activeDocument.updatedAt,
  }
}

function seedMultiChapterDocument(): void {
  const chapterOne = buildChapter('chapter-1', 'Chapter One', 0)
  const chapterTwo = buildChapter('chapter-2', 'Chapter Two', 1)
  useAppStore.setState({
    documents: [activeDocument],
    documentChapters: [chapterOne, chapterTwo],
    documentPages: [
      ...Array.from({ length: 3 }, (_, index) => buildPage(chapterOne.id, index + 1, index, `Chapter One page ${index + 1}`)),
      ...Array.from({ length: 10 }, (_, index) => buildPage(chapterTwo.id, index + 4, index, `Chapter Two page ${index + 1}`)),
    ],
    ocrJobs: [],
    ocrJobItems: [],
    ocrRuntimeJobs: {},
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: activeDocument.createdAt,
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'stats', 'settings'],
    },
    baselineResult: null,
  })
}

function dispatchSectionShortcut(key: string, modifier: 'meta' | 'control'): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: modifier === 'control',
    key,
    metaKey: modifier === 'meta',
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/library/saved')
  resetStore()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('app section shortcuts', () => {
  it('keeps Import, OCR, and Saved as tabs inside the Library route', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Library' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Import' }))
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()
    expect(window.location.pathname).toBe('/library/import')

    await user.click(screen.getByRole('tab', { name: 'OCR' }))
    expect(screen.getByRole('heading', { name: 'Import pages from scans' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Library' }).classList.contains('active')).toBe(true)
    expect(window.location.pathname).toBe('/library/ocr')

    await user.click(screen.getByRole('tab', { name: 'Saved' }))
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Library' }).classList.contains('active')).toBe(true)
    expect(window.location.pathname).toBe('/library/saved')
  })

  it('routes saved documents, reader, and reader back navigation through URLs', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Shortcut test document/i }))
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter%3Adocument-1%3Adefault')

    await user.click(screen.getByRole('button', { name: 'Open reader' }))
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()
    expect(window.location.pathname).toBe('/reader/document-1/chapters/chapter%3Adocument-1%3Adefault')

    await user.click(screen.getByRole('button', { name: 'Back to library' }))
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()
    expect(window.location.pathname).toBe('/library/saved')
  })

  it('deep-links document detail to selected chapters and paginated pages', async () => {
    const user = userEvent.setup()
    seedMultiChapterDocument()
    window.history.replaceState(null, '', '/library/documents/document-1/chapters/chapter-2/pages/2')
    render(<App />)

    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()
    const chapterNav = screen.getByRole('navigation', { name: 'Document chapters' })
    expect(within(chapterNav).getByRole('button', { name: /Chapter Two/i }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText((_, element) => element?.textContent === 'Page 2 of 2 - showing 9-10 of 10')).toBeTruthy()
    expect(screen.getByText('Chapter Two page 9')).toBeTruthy()
    expect(screen.queryByText('Chapter Two page 1')).toBeNull()
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-2/pages/2')

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-2')
    expect(screen.getByText((_, element) => element?.textContent === 'Page 1 of 2 - showing 1-8 of 10')).toBeTruthy()
    expect(screen.getByText('Chapter Two page 1')).toBeTruthy()

    await user.click(within(chapterNav).getByRole('button', { name: /Chapter One/i }))
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-1')
    expect(screen.getByText((_, element) => element?.textContent === 'Page 1 of 1 - showing 1-3 of 3')).toBeTruthy()
    expect(screen.getByText('Chapter One page 1')).toBeTruthy()
    expect(screen.getByLabelText('Label for page 1')).toBeTruthy()
  })

  it('confirms before deleting a structured page from the document organizer', async () => {
    const user = userEvent.setup()
    seedMultiChapterDocument()
    window.history.replaceState(null, '', '/library/documents/document-1/chapters/chapter-1')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<App />)

    expect(screen.getByText('Chapter One page 1')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Delete Chapter One page 1' }))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete Chapter One page 1?'))
    expect(screen.getByText('Chapter One page 1')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Delete Chapter One page 1' }))
    expect(screen.queryByText('Chapter One page 1')).toBeNull()
    expect(useAppStore.getState().documentPages.some((page) => page.id === 'page-chapter-1-1')).toBe(false)
    expect(useAppStore.getState().documents[0].content).not.toContain('Chapter One page 1 text.')
  })

  it('selects multiple structured pages and deletes them together from the organizer', async () => {
    const user = userEvent.setup()
    seedMultiChapterDocument()
    window.history.replaceState(null, '', '/library/documents/document-1/chapters/chapter-1')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    await user.click(screen.getByLabelText('Select Chapter One page 1'))
    await user.click(screen.getByLabelText('Select Chapter One page 2'))
    expect(screen.getByText('2 selected')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Delete 2 selected pages' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete 2 pages? This removes their text from the document.')
    expect(screen.queryByText('Chapter One page 1')).toBeNull()
    expect(screen.queryByText('Chapter One page 2')).toBeNull()
    expect(useAppStore.getState().documentPages.some((page) => page.id === 'page-chapter-1-1')).toBe(false)
    expect(useAppStore.getState().documentPages.some((page) => page.id === 'page-chapter-1-2')).toBe(false)
    expect(useAppStore.getState().documents[0].content).not.toContain('Chapter One page 1 text.')
    expect(useAppStore.getState().documents[0].content).not.toContain('Chapter One page 2 text.')
  })

  it('navigates primary sections with Command shortcuts', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()

    expect(dispatchSectionShortcut('r', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()

    expect(dispatchSectionShortcut('s', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()

    expect(dispatchSectionShortcut('g', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()

    expect(dispatchSectionShortcut('l', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()
  })

  it('navigates primary sections with Control shortcuts', () => {
    render(<App />)

    expect(dispatchSectionShortcut('r', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()

    expect(dispatchSectionShortcut('s', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()

    expect(dispatchSectionShortcut('g', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()

    expect(dispatchSectionShortcut('l', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()
  })

  it('does not navigate or prevent defaults while editing fields', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Import' }))
    const titleInput = screen.getByLabelText('Title')
    await user.click(titleInput)

    const inputEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 's',
    })
    titleInput.dispatchEvent(inputEvent)

    expect(inputEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()

    const textArea = screen.getByLabelText('Text')
    const textAreaEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'g',
    })
    textArea.dispatchEvent(textAreaEvent)

    expect(textAreaEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()

    dispatchSectionShortcut('g', 'control')
    const select = screen.getByLabelText('Default mode')
    const selectEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'l',
    })
    select.dispatchEvent(selectEvent)

    expect(selectEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()
  })

  it('exposes visible and accessible shortcut hints on primary navigation', () => {
    render(<App />)

    const statsButton = screen.getByRole('button', { name: 'Stats' })

    expect(statsButton.getAttribute('aria-keyshortcuts')).toBe('Meta+S Control+S')
    expect(statsButton.getAttribute('title')).toBe('Stats (Command+S / Control+S)')
    expect(screen.getByText('⌘S')).toBeTruthy()
  })

  it('does not register section shortcuts during first-run onboarding', () => {
    useAppStore.setState({ onboarding: defaultOnboardingState })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Start with a baseline before the full app.' })).toBeTruthy()
    expect(dispatchSectionShortcut('s', 'control').defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Start with a baseline before the full app.' })).toBeTruthy()
  })
})

describe('route helpers', () => {
  it('parses and builds document chapter/page routes', () => {
    expect(routeFromPath('/library/documents/document-1/chapters/chapter-2/pages/3')).toEqual({
      route: 'library-document',
      documentId: 'document-1',
      chapterId: 'chapter-2',
      pageNumber: 3,
    })
    expect(pathForRoute({
      route: 'library-document',
      documentId: 'document-1',
      chapterId: 'chapter-2',
      pageNumber: 3,
    })).toBe('/library/documents/document-1/chapters/chapter-2/pages/3')
    expect(pathForRoute({
      route: 'library-document',
      documentId: 'document-1',
      chapterId: 'chapter-2',
      pageNumber: 1,
    })).toBe('/library/documents/document-1/chapters/chapter-2')
    expect(routeFromPath('/reader/document-1/chapters/chapter-2/pages/4/7')).toEqual({
      route: 'reader',
      documentId: 'document-1',
      chapterId: 'chapter-2',
      startPageNumber: 4,
      endPageNumber: 7,
    })
    expect(pathForRoute({
      route: 'reader',
      documentId: 'document-1',
      chapterId: 'chapter-2',
      startPageNumber: 4,
      endPageNumber: 7,
    })).toBe('/reader/document-1/chapters/chapter-2/pages/4/7')
  })
})

describe('shortcut helpers', () => {
  it('ignores unrelated or already handled keyboard events', () => {
    const plainEvent = new KeyboardEvent('keydown', { key: 's' })
    const altEvent = new KeyboardEvent('keydown', { altKey: true, ctrlKey: true, key: 's' })
    const shiftedEvent = new KeyboardEvent('keydown', { ctrlKey: true, key: 's', shiftKey: true })
    const preventedEvent = new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key: 's' })

    preventedEvent.preventDefault()

    expect(getRouteForShortcutEvent(plainEvent)).toBeNull()
    expect(getRouteForShortcutEvent(altEvent)).toBeNull()
    expect(getRouteForShortcutEvent(shiftedEvent)).toBeNull()
    expect(getRouteForShortcutEvent(preventedEvent)).toBeNull()
  })

  it('detects editable targets that should keep normal typing behavior', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const contentEditable = document.createElement('div')
    const roleTextbox = document.createElement('div')
    const button = document.createElement('button')

    contentEditable.setAttribute('contenteditable', 'true')
    roleTextbox.setAttribute('role', 'textbox')

    expect(isEditableShortcutTarget(input)).toBe(true)
    expect(isEditableShortcutTarget(textarea)).toBe(true)
    expect(isEditableShortcutTarget(select)).toBe(true)
    expect(isEditableShortcutTarget(contentEditable)).toBe(true)
    expect(isEditableShortcutTarget(roleTextbox)).toBe(true)
    expect(isEditableShortcutTarget(button)).toBe(false)
  })
})
