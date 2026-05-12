import type {
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  ReadingScopeType,
} from '../types/domain'
import {
  getOrderedChapterPages,
  getOrderedDocumentChapters,
  getOrderedDocumentPages,
  renderStructuredContent,
} from './structuredDocuments'

export type ReaderScopeSelection = {
  scopeType: ReadingScopeType
  chapterId?: string | null
  startPageNumber?: number | null
  endPageNumber?: number | null
}

export type ReaderSessionScopeMetadata = {
  scopeType: ReadingScopeType
  scopeLabel: string
  chapterId: string | null
  chapterTitle: string | null
  pageIds: string[]
  pageNumbers: number[]
  sourcePageNumbers: Array<number | null>
}

export type BuiltReaderScope = ReaderSessionScopeMetadata & {
  content: string
  wordCount: number
  pageCount: number
  startWordOffset: number
  endWordOffset: number
  selectedChapterId: string | null
  selectedStartPageNumber: number | null
  selectedEndPageNumber: number | null
}

export type ReaderScopeDescriptor = ReaderSessionScopeMetadata & {
  selectedPages: DocumentPageRecord[]
  wordCount: number
  pageCount: number
  startWordOffset: number
  endWordOffset: number
  selectedChapterId: string | null
  selectedStartPageNumber: number | null
  selectedEndPageNumber: number | null
}

type OrderedPageWithOffset = {
  page: DocumentPageRecord
  startWordOffset: number
  endWordOffset: number
}

export function buildReaderScope(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  selection: ReaderScopeSelection,
): BuiltReaderScope {
  const descriptor = buildReaderScopeDescriptor(document, chapters, pages, selection)
  const documentChapters = getOrderedDocumentChapters(document.id, chapters)
  const documentPages = getOrderedDocumentPages(document.id, chapters, pages)
  const content =
    descriptor.scopeType === 'document'
      ? renderStructuredContent(document.id, documentChapters, documentPages) || document.content
      : renderPagesContent(descriptor.selectedPages)

  return {
    ...descriptor,
    content,
  }
}

export function buildReaderScopeDescriptor(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  selection: ReaderScopeSelection,
): ReaderScopeDescriptor {
  const documentChapters = getOrderedDocumentChapters(document.id, chapters)
  const documentPages = getOrderedDocumentPages(document.id, chapters, pages)
  const pagesWithOffsets = buildPageOffsets(documentPages)
  const documentScope = buildScopeFromPages({
    document,
    label: 'Full document',
    pagesWithOffsets,
    scopeType: 'document',
    selectedChapter: null,
  })

  if (selection.scopeType === 'document' || documentChapters.length === 0) {
    return documentScope
  }

  const selectedChapter =
    documentChapters.find((chapter) => chapter.id === selection.chapterId) ?? documentChapters[0] ?? null

  if (!selectedChapter) {
    return documentScope
  }

  const chapterPages = getOrderedChapterPages(selectedChapter.id, documentPages)
  if (chapterPages.length === 0) {
    return {
      ...documentScope,
      chapterId: selectedChapter.id,
      chapterTitle: selectedChapter.title,
      endWordOffset: documentScope.startWordOffset,
      pageCount: 0,
      pageIds: [],
      pageNumbers: [],
      scopeLabel: selectedChapter.title,
      scopeType: 'chapter',
      selectedChapterId: selectedChapter.id,
      selectedEndPageNumber: null,
      selectedPages: [],
      selectedStartPageNumber: null,
      sourcePageNumbers: [],
      wordCount: 0,
    }
  }

  if (selection.scopeType === 'chapter') {
    return buildScopeFromPages({
      document,
      label: selectedChapter.title,
      pagesWithOffsets: pagesWithOffsets.filter(({ page }) => page.chapterId === selectedChapter.id),
      scopeType: 'chapter',
      selectedChapter,
    })
  }

  const selectedPages = selectContiguousChapterPages(
    chapterPages,
    selection.startPageNumber,
    selection.endPageNumber,
  )

  return buildScopeFromPages({
    document,
    label: formatPageRangeLabel(selectedChapter.title, selectedPages),
    pagesWithOffsets: selectedPages
      .map((page) => pagesWithOffsets.find((candidate) => candidate.page.id === page.id))
      .filter((pageWithOffset): pageWithOffset is OrderedPageWithOffset => Boolean(pageWithOffset)),
    scopeType: 'pages',
    selectedChapter,
  })
}

export function normalizeReaderScopeSelection(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  selection: ReaderScopeSelection,
): ReaderScopeSelection {
  const scope = buildReaderScope(document, chapters, pages, selection)

  return {
    scopeType: scope.scopeType,
    chapterId: scope.selectedChapterId,
    startPageNumber: scope.selectedStartPageNumber,
    endPageNumber: scope.selectedEndPageNumber,
  }
}

function buildScopeFromPages({
  document,
  label,
  pagesWithOffsets,
  scopeType,
  selectedChapter,
}: {
  document: DocumentRecord
  label: string
  pagesWithOffsets: OrderedPageWithOffset[]
  scopeType: ReadingScopeType
  selectedChapter: DocumentChapterRecord | null
}): ReaderScopeDescriptor {
  const selectedPages = pagesWithOffsets.map(({ page }) => page)
  const startWordOffset = pagesWithOffsets[0]?.startWordOffset ?? 0
  const endWordOffset = pagesWithOffsets[pagesWithOffsets.length - 1]?.endWordOffset ?? document.wordCount
  const selectedWordCount = selectedPages.reduce((total, page) => total + page.wordCount, 0)

  return {
    scopeType,
    scopeLabel: label,
    chapterId: selectedChapter?.id ?? null,
    chapterTitle: selectedChapter?.title ?? null,
    pageIds: selectedPages.map((page) => page.id),
    pageNumbers: selectedPages.map((page) => page.pageNumber),
    sourcePageNumbers: selectedPages.map((page) => page.sourcePageNumber),
    selectedPages,
    wordCount: selectedPages.length > 0 ? selectedWordCount : document.wordCount,
    pageCount: selectedPages.length,
    startWordOffset,
    endWordOffset,
    selectedChapterId: selectedChapter?.id ?? null,
    selectedStartPageNumber: selectedPages[0]?.pageNumber ?? null,
    selectedEndPageNumber: selectedPages[selectedPages.length - 1]?.pageNumber ?? null,
  }
}

function buildPageOffsets(pages: DocumentPageRecord[]): OrderedPageWithOffset[] {
  let wordCursor = 0
  return pages.map((page) => {
    const startWordOffset = wordCursor
    const endWordOffset = startWordOffset + page.wordCount
    wordCursor = endWordOffset
    return { page, startWordOffset, endWordOffset }
  })
}

function selectContiguousChapterPages(
  chapterPages: DocumentPageRecord[],
  requestedStartPageNumber?: number | null,
  requestedEndPageNumber?: number | null,
): DocumentPageRecord[] {
  if (chapterPages.length === 0) {
    return []
  }

  const pageNumbers = chapterPages.map((page) => page.pageNumber)
  const fallbackStart = pageNumbers[0]
  const fallbackEnd = requestedStartPageNumber ?? fallbackStart
  const startPageNumber = requestedStartPageNumber ?? fallbackStart
  const endPageNumber = requestedEndPageNumber ?? fallbackEnd
  const normalizedStart = Math.min(startPageNumber, endPageNumber)
  const normalizedEnd = Math.max(startPageNumber, endPageNumber)
  const startIndex = findClosestPageIndex(chapterPages, normalizedStart)
  const endIndex = findClosestPageIndex(chapterPages, normalizedEnd)
  const sliceStart = Math.min(startIndex, endIndex)
  const sliceEnd = Math.max(startIndex, endIndex)

  return chapterPages.slice(sliceStart, sliceEnd + 1)
}

function findClosestPageIndex(pages: DocumentPageRecord[], pageNumber: number): number {
  const exactIndex = pages.findIndex((page) => page.pageNumber === pageNumber)
  if (exactIndex >= 0) {
    return exactIndex
  }

  const nextIndex = pages.findIndex((page) => page.pageNumber > pageNumber)
  if (nextIndex >= 0) {
    return nextIndex
  }

  return pages.length - 1
}

function renderPagesContent(pages: DocumentPageRecord[]): string {
  return pages.map((page) => page.text.trim()).filter(Boolean).join('\n\n\f\n\n')
}

function formatPageRangeLabel(chapterTitle: string, pages: DocumentPageRecord[]): string {
  const firstPage = pages[0]
  const lastPage = pages[pages.length - 1]
  if (!firstPage || !lastPage) {
    return chapterTitle
  }

  const firstPageLabel = getReaderPageDisplayNumber(firstPage)
  const lastPageLabel = getReaderPageDisplayNumber(lastPage)
  const firstLabel = `page ${firstPageLabel}`
  const lastLabel = firstPage.id === lastPage.id ? firstLabel : `pages ${firstPageLabel}-${lastPageLabel}`
  return `${chapterTitle}, ${lastLabel}`
}

export function getReaderPageDisplayNumber(page: Pick<DocumentPageRecord, 'pageNumber' | 'sourcePageNumber'>): number {
  return page.sourcePageNumber ?? page.pageNumber
}
