import { describe, expect, it } from 'vitest'
import { buildReaderScope } from '../app/readerScopes'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

const documentRecord: DocumentRecord = {
  id: 'doc-1',
  title: 'Structured reader',
  sourceType: 'photo_ocr',
  content: 'One two three.\n\n\f\n\nFour five six.\n\n\f\n\nSeven eight nine.',
  wordCount: 9,
  estimatedPages: 3,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  archivedAt: null,
}

function buildChapter(id: string, title: string, sortOrder: number): DocumentChapterRecord {
  return {
    id,
    documentId: documentRecord.id,
    title,
    sortOrder,
    createdAt: documentRecord.createdAt,
    updatedAt: documentRecord.updatedAt,
  }
}

function buildPage(
  id: string,
  chapterId: string,
  pageNumber: number,
  sortOrder: number,
  text: string,
  sourcePageNumber: number | null = pageNumber + 10,
): DocumentPageRecord {
  return {
    id,
    documentId: documentRecord.id,
    chapterId,
    sortOrder,
    pageNumber,
    sourcePageNumber,
    title: null,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: null,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: documentRecord.createdAt,
    updatedAt: documentRecord.updatedAt,
  }
}

const chapterOne = buildChapter('chapter-1', 'Opening', 0)
const chapterTwo = buildChapter('chapter-2', 'Methods', 1)
const chapters = [chapterTwo, chapterOne]
const pages = [
  buildPage('page-3', chapterTwo.id, 3, 1, 'Seven eight nine.'),
  buildPage('page-1', chapterOne.id, 1, 0, 'One two three.'),
  buildPage('page-2', chapterTwo.id, 2, 0, 'Four five six.'),
]

describe('reader scope helpers', () => {
  it('builds a full document scope in organized page order', () => {
    const scope = buildReaderScope(documentRecord, chapters, pages, { scopeType: 'document' })

    expect(scope.scopeLabel).toBe('Full document')
    expect(scope.content).toBe('One two three.\n\n\f\n\nFour five six.\n\n\f\n\nSeven eight nine.')
    expect(scope.wordCount).toBe(9)
    expect(scope.pageNumbers).toEqual([1, 2, 3])
    expect(scope.startWordOffset).toBe(0)
    expect(scope.endWordOffset).toBe(9)
  })

  it('builds a whole chapter scope with document-level word offsets', () => {
    const scope = buildReaderScope(documentRecord, chapters, pages, {
      scopeType: 'chapter',
      chapterId: chapterTwo.id,
    })

    expect(scope.scopeLabel).toBe('Methods')
    expect(scope.content).toBe('Four five six.\n\n\f\n\nSeven eight nine.')
    expect(scope.wordCount).toBe(6)
    expect(scope.pageNumbers).toEqual([2, 3])
    expect(scope.sourcePageNumbers).toEqual([12, 13])
    expect(scope.startWordOffset).toBe(3)
    expect(scope.endWordOffset).toBe(9)
  })

  it('builds a contiguous page range inside one chapter', () => {
    const scope = buildReaderScope(documentRecord, chapters, pages, {
      scopeType: 'pages',
      chapterId: chapterTwo.id,
      startPageNumber: 3,
      endPageNumber: 2,
    })

    expect(scope.scopeLabel).toBe('Methods, pages 12-13')
    expect(scope.content).toBe('Four five six.\n\n\f\n\nSeven eight nine.')
    expect(scope.pageIds).toEqual(['page-2', 'page-3'])
    expect(scope.pageNumbers).toEqual([2, 3])
    expect(scope.startWordOffset).toBe(3)
    expect(scope.endWordOffset).toBe(9)
  })
})
