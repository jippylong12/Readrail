import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

export const STRUCTURED_DOCUMENT_VERSION = 1

type LegacyDocumentRecord = Omit<DocumentRecord, 'structureVersion'> & Partial<Pick<DocumentRecord, 'structureVersion'>>

type StructuredDocumentCollectionsInput = {
  documents?: LegacyDocumentRecord[]
  documentChapters?: DocumentChapterRecord[]
  documentPages?: DocumentPageRecord[]
}

export type StructuredDocumentCollections = {
  documents: DocumentRecord[]
  documentChapters: DocumentChapterRecord[]
  documentPages: DocumentPageRecord[]
}

export type NormalizedDocumentStructure = {
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
}

export function defaultDocumentChapterId(documentId: string): string {
  return `chapter:${documentId}:default`
}

export function defaultDocumentPageId(documentId: string): string {
  return `page:${documentId}:default`
}

export function createDefaultDocumentStructure(
  document: DocumentRecord,
  options: {
    chapterTitle?: string
    pageTitle?: string | null
    sourcePageNumber?: number | null
  } = {},
): {
  chapter: DocumentChapterRecord
  page: DocumentPageRecord
} {
  const chapter = createDefaultChapter(document, options.chapterTitle)
  return {
    chapter,
    page: createDefaultPage(document, chapter.id, {
      pageTitle: options.pageTitle,
      sourcePageNumber: options.sourcePageNumber,
    }),
  }
}

export function ensureStructuredDocumentCollections(
  input: StructuredDocumentCollectionsInput,
): StructuredDocumentCollections {
  const documents = (input.documents ?? []).map(normalizeDocumentStructureVersion)
  const documentChapters = [...(input.documentChapters ?? [])]
  const documentPages = [...(input.documentPages ?? [])]

  for (const document of documents) {
    const existingChapters = documentChapters
      .filter((chapter) => chapter.documentId === document.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const existingPages = documentPages.filter((page) => page.documentId === document.id)

    if (existingChapters.length === 0) {
      documentChapters.push(createDefaultChapter(document))
    }

    if (existingPages.length === 0) {
      const chapterId = existingChapters[0]?.id ?? defaultDocumentChapterId(document.id)
      documentPages.push(createDefaultPage(document, chapterId))
    }
  }

  return {
    documents,
    documentChapters,
    documentPages,
  }
}

export function getOrderedDocumentChapters(
  documentId: string,
  chapters: DocumentChapterRecord[],
): DocumentChapterRecord[] {
  return chapters
    .filter((chapter) => chapter.documentId === documentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
}

export function getOrderedChapterPages(
  chapterId: string,
  pages: DocumentPageRecord[],
): DocumentPageRecord[] {
  return pages
    .filter((page) => page.chapterId === chapterId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
}

export function getOrderedDocumentPages(
  documentId: string,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
): DocumentPageRecord[] {
  const orderedChapters = getOrderedDocumentChapters(documentId, chapters)
  const chapterIds = new Set(orderedChapters.map((chapter) => chapter.id))
  const orderedPages = orderedChapters.flatMap((chapter) => getOrderedChapterPages(chapter.id, pages))
  const orphanPages = pages
    .filter((page) => page.documentId === documentId && !chapterIds.has(page.chapterId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))

  return [...orderedPages, ...orphanPages]
}

export function renderStructuredContent(
  documentId: string,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
): string {
  return getOrderedDocumentPages(documentId, chapters, pages)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join('\n\n\f\n\n')
}

export function getDefaultPageTitle(page: Pick<DocumentPageRecord, 'pageNumber' | 'sourcePageNumber'>): string {
  return `Page ${page.sourcePageNumber ?? page.pageNumber}`
}

export function getDocumentPageDisplayTitle(
  page: Pick<DocumentPageRecord, 'pageNumber' | 'sourcePageNumber' | 'title'>,
): string {
  return page.title?.trim() || getDefaultPageTitle(page)
}

export function normalizeDocumentStructureOrder(
  documentId: string,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  updatedAt: string,
): NormalizedDocumentStructure {
  const orderedChapters = getOrderedDocumentChapters(documentId, chapters)
  const normalizedChapters = orderedChapters.map((chapter, chapterIndex) =>
    chapter.sortOrder === chapterIndex ? chapter : { ...chapter, sortOrder: chapterIndex, updatedAt },
  )

  let nextPageNumber = 1
  const normalizedPages = normalizedChapters.flatMap((chapter) =>
    getOrderedChapterPages(chapter.id, pages).map((page, pageIndex) => {
      const pageNumber = nextPageNumber
      nextPageNumber += 1

      if (page.sortOrder === pageIndex && page.pageNumber === pageNumber) {
        return page
      }

      return {
        ...page,
        sortOrder: pageIndex,
        pageNumber,
        updatedAt,
      }
    }),
  )

  return {
    chapters: normalizedChapters,
    pages: normalizedPages,
  }
}

export function normalizeDocumentStructureVersion(document: LegacyDocumentRecord): DocumentRecord {
  return {
    ...document,
    structureVersion: document.structureVersion ?? STRUCTURED_DOCUMENT_VERSION,
  }
}

export function createDefaultChapter(document: DocumentRecord, title?: string): DocumentChapterRecord {
  return {
    id: defaultDocumentChapterId(document.id),
    documentId: document.id,
    title: title?.trim() || 'Main text',
    sortOrder: 0,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

export function createDefaultPage(
  document: DocumentRecord,
  chapterId: string,
  options: {
    pageTitle?: string | null
    sourcePageNumber?: number | null
  } = {},
): DocumentPageRecord {
  return {
    id: defaultDocumentPageId(document.id),
    documentId: document.id,
    chapterId,
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: options.sourcePageNumber ?? null,
    title: options.pageTitle?.trim() || null,
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
