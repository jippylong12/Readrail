// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { pathForRoute, routeFromPath } from '../app/routes'
import { getRouteForShortcutEvent, isEditableShortcutTarget } from '../app/shortcuts'
import { createDefaultDocumentStructure } from '../app/structuredDocuments'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import type { AiUsageLineItem, DocumentChapterRecord, DocumentPageRecord, DocumentRecord, OcrJob } from '../types/domain'

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
    aiUsageLineItems: [],
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: new Date().toISOString(),
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'progress', 'costs', 'stats', 'settings'],
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

function buildOcrJob(): OcrJob {
  return {
    id: 'job-1',
    documentId: activeDocument.id,
    targetChapterId: null,
    status: 'review',
    modelId: 'gemini-3.1-flash-lite',
    inputFileCount: 1,
    promptVersion: 'v1',
    warnings: [],
    errorMessage: null,
    createdAt: activeDocument.createdAt,
    updatedAt: activeDocument.updatedAt,
    completedAt: activeDocument.updatedAt,
  }
}

function buildAiUsageLineItem(overrides: Partial<AiUsageLineItem> = {}): AiUsageLineItem {
  return {
    id: 'usage-1',
    documentId: activeDocument.id,
    ocrJobId: 'job-1',
    ocrItemId: 'item-1',
    sourceFileName: 'scan.png',
    stage: 'ocr_extraction',
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    status: 'succeeded',
    startedAt: activeDocument.createdAt,
    completedAt: activeDocument.updatedAt,
    failureMessage: null,
    rawProviderMetadata: null,
    pricingSnapshot: {
      confidence: 'estimated',
      currency: 'USD',
      effectiveDate: '2026-05-12',
      estimatedInputCost: 0.00025,
      estimatedOutputCost: 0.00017,
      estimatedThinkingCost: null,
      estimatedTotalCost: 0.00042,
      inputRatePerMillionTokens: 0.25,
      modelId: 'gemini-3.1-flash-lite',
      outputRatePerMillionTokens: 1.5,
      thinkingRatePerMillionTokens: null,
    },
    tokenBreakdown: {
      audioInputTokens: null,
      audioOutputTokens: null,
      cachedAudioInputTokens: null,
      cachedDocumentInputTokens: null,
      cachedImageInputTokens: null,
      cachedInputTokens: null,
      cachedTextInputTokens: null,
      cachedVideoInputTokens: null,
      documentInputTokens: null,
      documentOutputTokens: null,
      imageInputTokens: 200,
      imageOutputTokens: null,
      inputTokens: 1000,
      outputTokens: 200,
      textInputTokens: 800,
      textOutputTokens: 200,
      thinkingTokens: null,
      totalTokens: 1200,
      videoInputTokens: null,
      videoOutputTokens: null,
    },
    ...overrides,
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
    aiUsageLineItems: [],
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: activeDocument.createdAt,
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'progress', 'costs', 'stats', 'settings'],
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
  it('keeps Manual, OCR, and Saved as tabs inside the Library route', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Library' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Manual' }))
    expect(screen.getByRole('heading', { name: 'Create document' })).toBeTruthy()
    expect(window.location.pathname).toBe('/library/manual')

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

  it('opens a document-specific Costs drilldown from document detail', async () => {
    const user = userEvent.setup()
    useAppStore.setState({
      aiUsageLineItems: [buildAiUsageLineItem()],
      ocrJobs: [buildOcrJob()],
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Shortcut test document/i }))
    await user.click(screen.getByRole('button', { name: 'View AI costs' }))

    expect(screen.getByRole('heading', { name: 'AI usage costs' })).toBeTruthy()
    expect(window.location.pathname).toBe('/costs')
    expect(window.location.search).toBe('?documentId=document-1')
    expect((screen.getByLabelText('Document') as HTMLSelectElement).value).toBe('document-1')

    await user.click(screen.getByRole('button', { name: /Show OCR job/ }))

    expect(screen.getByText('scan.png')).toBeTruthy()
  })

  it('deep-links document detail to selected chapters and paginated pages', async () => {
    const user = userEvent.setup()
    seedMultiChapterDocument()
    window.history.replaceState(null, '', '/library/documents/document-1/chapters/chapter-2')
    render(<App />)

    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()
    const chapterNav = screen.getByRole('navigation', { name: 'Document chapters' })
    expect(within(chapterNav).getByRole('button', { name: /Chapter Two/i }).getAttribute('aria-current')).toBe('page')
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-2')
    expect(screen.getByText((_, element) => element?.textContent === 'Page 1 of 1 - showing 1-10 of 10')).toBeTruthy()
    expect(screen.getByText('Chapter Two page 1')).toBeTruthy()

    await user.click(within(chapterNav).getByRole('button', { name: /Chapter One/i }))
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-1')
    expect(screen.getByText((_, element) => element?.textContent === 'Page 1 of 1 - showing 1-3 of 3')).toBeTruthy()
    expect(screen.getByText('Chapter One page 1')).toBeTruthy()
    expect(screen.getByLabelText('Label for page 1')).toBeTruthy()
  })

  it('opens a dedicated page detail route and edits page metadata and content', async () => {
    const user = userEvent.setup()
    seedMultiChapterDocument()
    window.history.replaceState(null, '', '/library/documents/document-1/pages/page-chapter-1-1')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Chapter One page 1' })).toBeTruthy()
    expect(window.location.pathname).toBe('/library/documents/document-1/pages/page-chapter-1-1')

    await user.clear(screen.getByLabelText('Page label'))
    await user.type(screen.getByLabelText('Page label'), 'Opening page')
    fireEvent.blur(screen.getByLabelText('Page label'))
    await user.clear(screen.getByLabelText('Source page'))
    await user.type(screen.getByLabelText('Source page'), '163')
    fireEvent.blur(screen.getByLabelText('Source page'))
    await user.selectOptions(screen.getByLabelText('Review status'), 'needs_attention')
    await user.type(screen.getByLabelText('OCR notes'), 'Check the margin note')
    fireEvent.blur(screen.getByLabelText('OCR notes'))
    await user.clear(screen.getByLabelText('Page content'))
    await user.type(screen.getByLabelText('Page content'), 'Edited page detail text.')
    fireEvent.blur(screen.getByLabelText('Page content'))

    const page = useAppStore.getState().documentPages.find((candidate) => candidate.id === 'page-chapter-1-1')!
    expect(page).toMatchObject({
      title: 'Opening page',
      sourcePageNumber: 163,
      reviewStatus: 'needs_attention',
      ocrNotes: 'Check the margin note',
      text: 'Edited page detail text.',
      wordCount: 4,
    })
    expect(useAppStore.getState().documents[0].content).toContain('Edited page detail text.')

    await user.click(screen.getByRole('button', { name: 'Back to document' }))
    expect(window.location.pathname).toBe('/library/documents/document-1/chapters/chapter-1')
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

    expect(dispatchSectionShortcut('c', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'AI usage costs' })).toBeTruthy()

    expect(dispatchSectionShortcut('s', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()

    expect(dispatchSectionShortcut('g', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()

    expect(dispatchSectionShortcut('l', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Reading documents' })).toBeTruthy()
  })

  it('opens Costs from top-level navigation with a registered shortcut hint', async () => {
    const user = userEvent.setup()
    render(<App />)

    const costsButton = screen.getByRole('button', { name: 'Costs' })
    expect(costsButton.getAttribute('aria-keyshortcuts')).toBe('Meta+C Control+C')
    expect(costsButton.getAttribute('title')).toBe('Costs (Command+C / Control+C)')
    expect(screen.getByText('⌘C')).toBeTruthy()

    await user.click(costsButton)

    expect(screen.getByRole('heading', { name: 'AI usage costs' })).toBeTruthy()
    expect(window.location.pathname).toBe('/costs')
    expect(costsButton.classList.contains('active')).toBe(true)
  })

  it('navigates primary sections with Control shortcuts', () => {
    render(<App />)

    expect(dispatchSectionShortcut('r', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()

    expect(dispatchSectionShortcut('c', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'AI usage costs' })).toBeTruthy()

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

    await user.click(screen.getByRole('tab', { name: 'Manual' }))
    const titleInput = screen.getByLabelText('Document title')
    await user.click(titleInput)

    const inputEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 's',
    })
    titleInput.dispatchEvent(inputEvent)

    expect(inputEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Create document' })).toBeTruthy()

    const textArea = screen.getByLabelText('First page text')
    const textAreaEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'g',
    })
    textArea.dispatchEvent(textAreaEvent)

    expect(textAreaEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Create document' })).toBeTruthy()

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
    expect(routeFromPath('/library/documents/document-1/pages/page-1')).toEqual({
      route: 'library-page',
      documentId: 'document-1',
      pageId: 'page-1',
    })
    expect(pathForRoute({
      route: 'library-page',
      documentId: 'document-1',
      pageId: 'page-1',
    })).toBe('/library/documents/document-1/pages/page-1')
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
    expect(routeFromPath('/costs')).toEqual({
      route: 'costs',
      documentId: null,
      ocrJobId: null,
    })
    expect(pathForRoute({
      route: 'costs',
      documentId: null,
    })).toBe('/costs')
    expect(routeFromPath('/costs?documentId=document-1')).toEqual({
      route: 'costs',
      documentId: 'document-1',
      ocrJobId: null,
    })
    expect(pathForRoute({
      route: 'costs',
      documentId: 'document-1',
    })).toBe('/costs?documentId=document-1')
    expect(routeFromPath('/costs?ocrJobId=job-1')).toEqual({
      route: 'costs',
      documentId: null,
      ocrJobId: 'job-1',
    })
    expect(pathForRoute({
      route: 'costs',
      documentId: null,
      ocrJobId: 'job-1',
    })).toBe('/costs?ocrJobId=job-1')
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
