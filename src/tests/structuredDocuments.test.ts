// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type OcrPageInput } from '../app/store'
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

  it('creates a structured OCR document with one page record per reviewed page', () => {
    const document = useAppStore.getState().createOcrDocument({
      title: 'Reviewed scan',
      pages: [
        buildOcrPageInput({
          pageNumber: 7,
          text: 'First OCR page.',
          sourceFileName: 'scan-7.png',
          ocrConfidence: 0.91,
        }),
        buildOcrPageInput({
          pageNumber: 8,
          text: 'Second OCR page text.',
          reviewStatus: 'needs_attention',
          ocrNotes: 'Check margin text',
        }),
      ],
    })

    const state = useAppStore.getState()
    const pages = state.documentPages
      .filter((page) => page.documentId === document.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)

    expect(document).toMatchObject({
      title: 'Reviewed scan',
      sourceType: 'photo_ocr',
      wordCount: 7,
      estimatedPages: 0,
    })
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      sourcePageNumber: 7,
      sortOrder: 0,
      text: 'First OCR page.',
      wordCount: 3,
      reviewStatus: 'reviewed',
      ocrConfidence: 0.91,
      sourceFileName: 'scan-7.png',
      sourceKind: 'image',
      sourceLocalPath: null,
      sourceSha256: null,
    })
    expect(pages[1]).toMatchObject({
      pageNumber: 2,
      sourcePageNumber: 8,
      sortOrder: 1,
      text: 'Second OCR page text.',
      wordCount: 4,
      reviewStatus: 'needs_attention',
      ocrNotes: 'Check margin text',
    })
    expect(state.activeDocumentId).toBe(document.id)
    expect(document.content).toContain('First OCR page.')
    expect(document.content).toContain('Second OCR page text.')
  })

  it('appends OCR pages after existing pages while preserving document data and history', () => {
    const document = useAppStore.getState().createDocument({
      title: 'Existing book',
      content: 'Existing page text.',
      sourceType: 'paste',
    })
    const session = {
      id: 'session-1',
      documentId: document.id,
      mode: 'rail' as const,
      targetWpm: 250,
      actualWpm: 240,
      adjustedWpm: 230,
      wordsRead: 3,
      durationSeconds: 1,
      startPosition: 0,
      endPosition: 3,
      pauseCount: 0,
      regressionCount: 0,
      comprehensionScore: 90,
      selfRating: null,
      notes: '',
      startedAt: '2026-05-11T12:00:00.000Z',
      endedAt: '2026-05-11T12:00:01.000Z',
    }
    const quizAttempt = {
      id: 'quiz-1',
      documentId: document.id,
      readingSessionId: session.id,
      kind: 'generated' as const,
      startWordIndex: 0,
      endWordIndex: 3,
      wordCount: 3,
      durationSeconds: 1,
      targetWpm: 250,
      rawWpm: 240,
      comprehensionPercent: 90,
      adjustedWpm: 230,
      recommendedWpm: 230,
      explanation: 'Steady.',
      questionResults: [],
      questions: [],
      createdAt: '2026-05-11T12:00:02.000Z',
    }
    const coaching = {
      recommendedWpm: 230,
      lastResetWordIndexByDocument: { [document.id]: 3 },
      activeSegmentByDocument: {
        [document.id]: {
          startWordIndex: 3,
          startedAt: null,
          targetWpm: 230,
        },
      },
    }
    useAppStore.setState({
      sessions: [session],
      quizAttempts: [quizAttempt],
      coaching,
    })

    const updated = useAppStore.getState().appendOcrPagesToDocument(document.id, [
      buildOcrPageInput({
        pageNumber: 3,
        text: 'Appended OCR page.',
        sourceFileName: 'scan-3.pdf',
        sourceKind: 'pdf',
      }),
      buildOcrPageInput({
        pageNumber: 4,
        text: 'Final appended page.',
      }),
    ])

    const state = useAppStore.getState()
    const pages = state.documentPages
      .filter((page) => page.documentId === document.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)

    expect(updated).toMatchObject({
      id: document.id,
      title: 'Existing book',
      sourceType: 'paste',
      archivedAt: null,
      wordCount: 9,
    })
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(pages.map((page) => page.sortOrder)).toEqual([0, 1, 2])
    expect(pages[0].id).toBe(defaultDocumentPageId(document.id))
    expect(pages[1]).toMatchObject({
      text: 'Appended OCR page.',
      sourcePageNumber: 3,
      sourceFileName: 'scan-3.pdf',
      sourceKind: 'pdf',
    })
    expect(pages[2]).toMatchObject({
      text: 'Final appended page.',
      sourcePageNumber: 4,
    })
    expect(state.sessions).toEqual([session])
    expect(state.quizAttempts).toEqual([quizAttempt])
    expect(state.coaching).toEqual(coaching)
    expect(state.activeDocumentId).toBe(document.id)
  })
})

function buildOcrPageInput(overrides: Partial<OcrPageInput> = {}): OcrPageInput {
  return {
    pageNumber: 1,
    text: 'OCR page text.',
    reviewStatus: 'reviewed',
    sourcePageNumber: overrides.pageNumber ?? 1,
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileName: null,
    sourceKind: 'image',
    ...overrides,
  }
}
