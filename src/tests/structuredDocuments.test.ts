// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../app/store'
import {
  STRUCTURED_DOCUMENT_VERSION,
  defaultDocumentChapterId,
  defaultDocumentPageId,
  ensureStructuredDocumentCollections,
} from '../app/structuredDocuments'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

type LegacyDocumentRecord = Omit<DocumentRecord, 'structureVersion'>

function buildLegacyDocument(overrides: Partial<LegacyDocumentRecord> = {}): LegacyDocumentRecord {
  return {
    id: 'doc-1',
    title: 'Migrated reading',
    sourceType: 'paste',
    content: 'Migrated flat text.',
    wordCount: 3,
    estimatedPages: 1,
    language: 'en',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  }
}

describe('structured document migration helpers', () => {
  it('migrates an existing flat document into one default chapter and page', () => {
    const migrated = ensureStructuredDocumentCollections({
      documents: [buildLegacyDocument()],
    })

    expect(migrated.documents[0]).toMatchObject({
      id: 'doc-1',
      title: 'Migrated reading',
      content: 'Migrated flat text.',
      sourceType: 'paste',
      wordCount: 3,
      estimatedPages: 1,
      structureVersion: STRUCTURED_DOCUMENT_VERSION,
    })
    expect(migrated.documentChapters).toEqual([
      {
        id: defaultDocumentChapterId('doc-1'),
        documentId: 'doc-1',
        title: 'Main text',
        sortOrder: 0,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ])
    expect(migrated.documentPages[0]).toMatchObject({
      id: defaultDocumentPageId('doc-1'),
      documentId: 'doc-1',
      chapterId: defaultDocumentChapterId('doc-1'),
      text: 'Migrated flat text.',
      wordCount: 3,
      reviewStatus: 'reviewed',
      uncertainSpans: [],
    })
  })

  it('preserves archived document state during migration', () => {
    const migrated = ensureStructuredDocumentCollections({
      documents: [
        buildLegacyDocument({
          archivedAt: '2026-05-03T00:00:00.000Z',
        }),
      ],
    })

    expect(migrated.documents[0].archivedAt).toBe('2026-05-03T00:00:00.000Z')
    expect(migrated.documentPages[0].documentId).toBe('doc-1')
  })

  it('marks migrated OCR documents as reviewed without storing provider secrets', () => {
    const migrated = ensureStructuredDocumentCollections({
      documents: [
        buildLegacyDocument({
          sourceType: 'photo_ocr',
          content: 'OCR text from a confirmed save.',
          wordCount: 6,
        }),
      ],
    })

    expect(migrated.documentPages[0]).toMatchObject({
      reviewStatus: 'reviewed',
      text: 'OCR text from a confirmed save.',
      sourceFileId: null,
      sourceFileName: null,
      sourceLocalPath: null,
      sourceSha256: null,
    })
  })

  it('migrates empty documents into empty reviewed pages', () => {
    const migrated = ensureStructuredDocumentCollections({
      documents: [
        buildLegacyDocument({
          content: '',
          wordCount: 0,
          estimatedPages: 0,
        }),
      ],
    })

    expect(migrated.documents[0].wordCount).toBe(0)
    expect(migrated.documentPages[0]).toMatchObject({
      text: '',
      wordCount: 0,
      reviewStatus: 'reviewed',
    })
  })

  it('does not duplicate existing structured children', () => {
    const document = buildLegacyDocument()
    const chapter: DocumentChapterRecord = {
      id: 'chapter-doc-1-existing',
      documentId: document.id,
      title: 'Existing chapter',
      sortOrder: 0,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }
    const page: DocumentPageRecord = {
      id: 'page-doc-1-existing',
      documentId: document.id,
      chapterId: chapter.id,
      sortOrder: 0,
      pageNumber: 1,
      sourcePageNumber: null,
      title: null,
      text: 'Existing structured text.',
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
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }

    const migrated = ensureStructuredDocumentCollections({
      documents: [document],
      documentChapters: [chapter],
      documentPages: [page],
    })

    expect(migrated.documentChapters).toEqual([chapter])
    expect(migrated.documentPages).toEqual([page])
  })
})

describe('structured document store behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAppStore.setState({
      documents: [],
      documentChapters: [],
      documentPages: [],
      sessions: [],
      activeDocumentId: null,
    })
  })

  it('creates and updates synchronized default structured pages', () => {
    const document = useAppStore.getState().createDocument({
      title: 'New structured reading',
      content: 'First draft text.',
      sourceType: 'paste',
    })

    let state = useAppStore.getState()
    expect(state.activeDocumentId).toBe(document.id)
    expect(state.documents[0]).toMatchObject({
      id: document.id,
      structureVersion: STRUCTURED_DOCUMENT_VERSION,
      content: 'First draft text.',
    })
    expect(state.documentChapters[0]).toMatchObject({
      id: defaultDocumentChapterId(document.id),
      documentId: document.id,
    })
    expect(state.documentPages[0]).toMatchObject({
      id: defaultDocumentPageId(document.id),
      documentId: document.id,
      chapterId: defaultDocumentChapterId(document.id),
      text: 'First draft text.',
      wordCount: 3,
      reviewStatus: 'reviewed',
    })

    useAppStore.getState().updateDocument(document.id, {
      content: 'Updated text with four words.',
    })

    state = useAppStore.getState()
    expect(state.documents[0]).toMatchObject({
      content: 'Updated text with four words.',
      wordCount: 5,
    })
    expect(state.documentPages[0]).toMatchObject({
      text: 'Updated text with four words.',
      wordCount: 5,
    })
  })
})
