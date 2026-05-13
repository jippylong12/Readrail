import { tokenizeReadableWords } from '../lib/text/chunking'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'
import { buildReaderScopeDescriptor, type ReaderScopeDescriptor, type ReaderScopeSelection } from './readerScopes'
import { getOrderedDocumentPages } from './structuredDocuments'

export const DEFAULT_READER_WINDOW_WORD_COUNT = 1_000
export const DEFAULT_READER_WINDOW_ADVANCE_THRESHOLD = DEFAULT_READER_WINDOW_WORD_COUNT

export type ReaderContentWindowOptions = {
  activeWindowWords?: number
  advanceThresholdWords?: number
}

export type ReaderContentWindowPage = {
  pageId: string
  chapterId: string
  pageNumber: number
  sourcePageNumber: number | null
  title: string | null
  startWordOffset: number
  endWordOffset: number
  scopeStartWordIndex: number
  scopeEndWordIndex: number
  windowStartWordIndex: number
  windowEndWordIndex: number
  wordCount: number
}

export type ReaderContentWindow = {
  content: string
  startWordIndex: number
  endWordIndex: number
  documentStartWordIndex: number
  documentEndWordIndex: number
  wordCount: number
  pageIds: string[]
  pageNumbers: number[]
  sourcePageNumbers: Array<number | null>
  pages: ReaderContentWindowPage[]
  isAtStart: boolean
  isAtEnd: boolean
}

export type ReaderContentModel = ReaderScopeDescriptor & {
  activeWindowWords: number
  advanceThresholdWords: number
  getWindow: (startWordIndex?: number) => ReaderContentWindow
  getWindowForWord: (scopeWordIndex: number) => ReaderContentWindow
  getNextWindow: (window: ReaderContentWindow) => ReaderContentWindow
  shouldAdvanceWindow: (scopeWordIndex: number, window: ReaderContentWindow) => boolean
}

type PageWithOffset = {
  page: DocumentPageRecord
  startWordOffset: number
  endWordOffset: number
}

export function buildReaderContentModel(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  selection: ReaderScopeSelection,
  options: ReaderContentWindowOptions = {},
): ReaderContentModel {
  const scope = buildReaderScopeDescriptor(document, chapters, pages, selection)
  const activeWindowWords = normalizePositiveInteger(
    options.activeWindowWords,
    DEFAULT_READER_WINDOW_WORD_COUNT,
  )
  const advanceThresholdWords = normalizePositiveInteger(
    options.advanceThresholdWords,
    activeWindowWords,
  )
  const sourcePages = buildSourcePages(document, chapters, pages, scope)

  function getWindow(startWordIndex = 0): ReaderContentWindow {
    return buildWindow(sourcePages, scope, normalizeWindowStart(startWordIndex, scope.wordCount), activeWindowWords)
  }

  function getWindowForWord(scopeWordIndex: number): ReaderContentWindow {
    const normalizedWordIndex = Math.max(0, Math.min(Math.floor(scopeWordIndex), Math.max(0, scope.wordCount - 1)))
    const windowStart = getReaderAlignedWindowStart(
      sourcePages,
      scope,
      normalizedWordIndex,
      activeWindowWords,
      advanceThresholdWords,
    )
    return getWindow(windowStart)
  }

  function getNextWindow(window: ReaderContentWindow): ReaderContentWindow {
    const nextWordIndex = Math.min(scope.wordCount, window.startWordIndex + advanceThresholdWords)
    return getWindow(
      getReaderAlignedWindowStart(
        sourcePages,
        scope,
        nextWordIndex,
        activeWindowWords,
        advanceThresholdWords,
      ),
    )
  }

  function shouldAdvanceWindow(scopeWordIndex: number, window: ReaderContentWindow): boolean {
    return !window.isAtEnd && scopeWordIndex >= window.startWordIndex + advanceThresholdWords
  }

  return {
    ...scope,
    activeWindowWords,
    advanceThresholdWords,
    getWindow,
    getWindowForWord,
    getNextWindow,
    shouldAdvanceWindow,
  }
}

function buildWindow(
  pagesWithOffsets: PageWithOffset[],
  scope: ReaderScopeDescriptor,
  startWordIndex: number,
  activeWindowWords: number,
): ReaderContentWindow {
  const endWordIndex = Math.min(scope.wordCount, startWordIndex + activeWindowWords)
  const documentStartWordIndex = scope.startWordOffset + startWordIndex
  const documentEndWordIndex = scope.startWordOffset + endWordIndex
  const windowPages = pagesWithOffsets
    .filter(({ startWordOffset, endWordOffset }) => startWordOffset < documentEndWordIndex && endWordOffset > documentStartWordIndex)
    .map(({ page, startWordOffset, endWordOffset }) => {
      const windowStartWordIndex = Math.max(documentStartWordIndex, startWordOffset)
      const windowEndWordIndex = Math.min(documentEndWordIndex, endWordOffset)
      return {
        page,
        startWordOffset,
        endWordOffset,
        scopeStartWordIndex: windowStartWordIndex - scope.startWordOffset,
        scopeEndWordIndex: windowEndWordIndex - scope.startWordOffset,
        windowStartWordIndex,
        windowEndWordIndex,
        wordCount: Math.max(0, windowEndWordIndex - windowStartWordIndex),
      }
    })

  return {
    content: windowPages.map(materializePageWindow).filter(Boolean).join('\n\n\f\n\n'),
    startWordIndex,
    endWordIndex,
    documentStartWordIndex,
    documentEndWordIndex,
    wordCount: Math.max(0, endWordIndex - startWordIndex),
    pageIds: windowPages.map(({ page }) => page.id),
    pageNumbers: windowPages.map(({ page }) => page.pageNumber),
    sourcePageNumbers: windowPages.map(({ page }) => page.sourcePageNumber),
    pages: windowPages.map(({ page, startWordOffset, endWordOffset, scopeStartWordIndex, scopeEndWordIndex, windowStartWordIndex, windowEndWordIndex, wordCount }) => ({
      pageId: page.id,
      chapterId: page.chapterId,
      pageNumber: page.pageNumber,
      sourcePageNumber: page.sourcePageNumber,
      title: page.title,
      startWordOffset,
      endWordOffset,
      scopeStartWordIndex,
      scopeEndWordIndex,
      windowStartWordIndex,
      windowEndWordIndex,
      wordCount,
    })),
    isAtStart: startWordIndex === 0,
    isAtEnd: endWordIndex >= scope.wordCount,
  }
}

function buildSourcePages(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  scope: ReaderScopeDescriptor,
): PageWithOffset[] {
  const orderedPages = getOrderedDocumentPages(document.id, chapters, pages)
  const scopedPageIds = new Set(scope.selectedPages.map((page) => page.id))
  const pagesWithOffsets = buildPageOffsets(orderedPages)
    .filter(({ page }) => scopedPageIds.has(page.id))

  if (pagesWithOffsets.length > 0) {
    return pagesWithOffsets
  }

  if (document.wordCount === 0) {
    return []
  }

  return [
    {
      page: buildVirtualDocumentPage(document),
      startWordOffset: 0,
      endWordOffset: document.wordCount,
    },
  ]
}

function buildPageOffsets(pages: DocumentPageRecord[]): PageWithOffset[] {
  let wordCursor = 0
  return pages.map((page) => {
    const startWordOffset = wordCursor
    const endWordOffset = startWordOffset + tokenizeReadableWords(page.text).length
    wordCursor = endWordOffset
    return { page, startWordOffset, endWordOffset }
  })
}

function getReaderAlignedWindowStart(
  pagesWithOffsets: PageWithOffset[],
  scope: ReaderScopeDescriptor,
  scopeWordIndex: number,
  activeWindowWords: number,
  advanceThresholdWords: number,
): number {
  const normalizedWordIndex = Math.max(0, Math.min(Math.floor(scopeWordIndex), Math.max(0, scope.wordCount - 1)))
  const defaultWindowStart = Math.floor(normalizedWordIndex / advanceThresholdWords) * advanceThresholdWords
  const documentWordIndex = scope.startWordOffset + normalizedWordIndex
  const activePage = pagesWithOffsets.find(
    ({ startWordOffset, endWordOffset }) => documentWordIndex >= startWordOffset && documentWordIndex < endWordOffset,
  )

  if (!activePage) {
    return defaultWindowStart
  }

  const pageScopeStartWordIndex = Math.max(0, activePage.startWordOffset - scope.startWordOffset)
  const pageRelativeWordIndex = normalizedWordIndex - pageScopeStartWordIndex

  if (pageRelativeWordIndex >= 0 && pageRelativeWordIndex < activeWindowWords) {
    return pageScopeStartWordIndex
  }

  return defaultWindowStart
}

function buildVirtualDocumentPage(document: DocumentRecord): DocumentPageRecord {
  return {
    id: `page:${document.id}:content-window`,
    documentId: document.id,
    chapterId: `chapter:${document.id}:content-window`,
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: null,
    title: null,
    text: document.content,
    wordCount: document.wordCount,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: null,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function materializePageWindow({ page, startWordOffset, windowStartWordIndex, windowEndWordIndex }: {
  page: DocumentPageRecord
  startWordOffset: number
  windowStartWordIndex: number
  windowEndWordIndex: number
}): string {
  const pageStartWordIndex = windowStartWordIndex - startWordOffset
  const pageEndWordIndex = windowEndWordIndex - startWordOffset
  return tokenizeReadableWords(page.text).slice(pageStartWordIndex, pageEndWordIndex).join(' ')
}

function normalizeWindowStart(startWordIndex: number, scopeWordCount: number): number {
  if (scopeWordCount <= 0) {
    return 0
  }

  return Math.max(0, Math.min(Math.floor(startWordIndex), scopeWordCount))
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.floor(value))
}
