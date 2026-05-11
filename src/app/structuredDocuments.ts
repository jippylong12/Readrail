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

export function defaultDocumentChapterId(documentId: string): string {
  return `chapter:${documentId}:default`
}

export function defaultDocumentPageId(documentId: string): string {
  return `page:${documentId}:default`
}

export function createDefaultDocumentStructure(document: DocumentRecord): {
  chapter: DocumentChapterRecord
  page: DocumentPageRecord
} {
  const chapter = createDefaultChapter(document)
  return {
    chapter,
    page: createDefaultPage(document, chapter.id),
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

export function normalizeDocumentStructureVersion(document: LegacyDocumentRecord): DocumentRecord {
  return {
    ...document,
    structureVersion: document.structureVersion ?? STRUCTURED_DOCUMENT_VERSION,
  }
}

export function createDefaultChapter(document: DocumentRecord): DocumentChapterRecord {
  return {
    id: defaultDocumentChapterId(document.id),
    documentId: document.id,
    title: 'Main text',
    sortOrder: 0,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

export function createDefaultPage(document: DocumentRecord, chapterId: string): DocumentPageRecord {
  return {
    id: defaultDocumentPageId(document.id),
    documentId: document.id,
    chapterId,
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
