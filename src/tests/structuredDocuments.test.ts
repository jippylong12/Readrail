// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type OcrPageInput } from '../app/store'
import {
  STRUCTURED_DOCUMENT_VERSION,
  defaultDocumentChapterId,
  defaultDocumentPageId,
  ensureStructuredDocumentCollections,
  getDocumentPageDisplayTitle,
  getOrderedChapterPages,
  getOrderedDocumentPages,
} from '../app/structuredDocuments'
import type {
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  OcrJob,
  OcrJobItem,
  QuizAttempt,
  ReadingSession,
} from '../types/domain'

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
      ocrJobs: [],
      ocrJobItems: [],
      sessions: [],
      quizAttempts: [],
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
      scopeType: 'document' as const,
      scopeLabel: null,
      chapterId: null,
      chapterTitle: null,
      pageIds: [],
      pageNumbers: [],
      sourcePageNumbers: [],
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

  it('appends OCR pages to the selected chapter when one is provided', () => {
    const document = buildStructuredDocumentFixture()
    const introduction = useAppStore.getState().documentChapters.find((chapter) => chapter.title === 'Introduction')!

    useAppStore.getState().appendOcrPagesToDocument(
      document.id,
      [
        buildOcrPageInput({
          text: 'Inserted introduction scan.',
          pageNumber: 23,
        }),
      ],
      introduction.id,
    )

    const state = useAppStore.getState()
    expect(getOrderedChapterPages(introduction.id, state.documentPages).map((page) => page.text)).toEqual([
      'First introduction page.',
      'Second introduction page.',
      'Inserted introduction scan.',
    ])
    expect(getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages).map((page) => page.text)).toEqual([
      'First introduction page.',
      'Second introduction page.',
      'Inserted introduction scan.',
      'Appendix page text.',
    ])
  })

  it('moves pages within and across chapters while keeping metadata attached to the page', () => {
    const document = buildStructuredDocumentFixture()
    const state = useAppStore.getState()
    const introduction = state.documentChapters.find((chapter) => chapter.title === 'Introduction')!
    const appendix = state.documentChapters.find((chapter) => chapter.title === 'Appendix')!
    const movedPage = state.documentPages.find((page) => page.id === 'page-intro-2')!

    useAppStore.getState().movePage(movedPage.id, appendix.id, 0)

    const nextState = useAppStore.getState()
    const orderedPages = getOrderedDocumentPages(document.id, nextState.documentChapters, nextState.documentPages)
    const moved = nextState.documentPages.find((page) => page.id === movedPage.id)!

    expect(getOrderedChapterPages(introduction.id, nextState.documentPages).map((page) => page.id)).toEqual(['page-intro-1'])
    expect(getOrderedChapterPages(appendix.id, nextState.documentPages).map((page) => page.id)).toEqual([
      'page-intro-2',
      'page-appendix-1',
    ])
    expect(orderedPages.map((page) => page.id)).toEqual(['page-intro-1', 'page-intro-2', 'page-appendix-1'])
    expect(orderedPages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(moved).toMatchObject({
      id: 'page-intro-2',
      text: 'Second introduction page.',
      reviewStatus: 'needs_attention',
      ocrNotes: 'Preserve this note',
      sourcePageNumber: 22,
      sourceFileName: 'intro-2.png',
      sourceKind: 'image',
      createdAt: '2026-05-11T12:00:00.000Z',
    })
    expect(nextState.documents[0]).toMatchObject({
      id: document.id,
      content: ['First introduction page.', 'Second introduction page.', 'Appendix page text.'].join('\n\n\f\n\n'),
      wordCount: 9,
    })
  })

  it('deletes one structured page, rebuilds reader text, and normalizes remaining page order', () => {
    const document = buildStructuredDocumentFixture()

    const deleted = useAppStore.getState().deletePage('page-intro-1')

    const state = useAppStore.getState()
    const orderedPages = getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages)

    expect(deleted).toBe(true)
    expect(state.documentPages.some((page) => page.id === 'page-intro-1')).toBe(false)
    expect(orderedPages.map((page) => page.id)).toEqual(['page-intro-2', 'page-appendix-1'])
    expect(orderedPages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(getOrderedChapterPages('chapter-intro', state.documentPages).map((page) => page.sortOrder)).toEqual([0])
    expect(getOrderedChapterPages('chapter-appendix', state.documentPages).map((page) => page.sortOrder)).toEqual([0])
    expect(state.documents[0]).toMatchObject({
      id: document.id,
      content: ['Second introduction page.', 'Appendix page text.'].join('\n\n\f\n\n'),
      wordCount: 6,
      estimatedPages: 0,
    })
    expect(state.documentChapters.filter((chapter) => chapter.documentId === document.id)).toHaveLength(2)
  })

  it('deletes multiple structured pages in one rebuild without deleting the final page', () => {
    const document = buildStructuredDocumentFixture()

    const deletedCount = useAppStore.getState().deletePages(['page-intro-1', 'page-intro-2'])

    let state = useAppStore.getState()
    let orderedPages = getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages)
    expect(deletedCount).toBe(2)
    expect(orderedPages.map((page) => page.id)).toEqual(['page-appendix-1'])
    expect(orderedPages[0]).toMatchObject({
      pageNumber: 1,
      sortOrder: 0,
      text: 'Appendix page text.',
    })
    expect(state.documents[0]).toMatchObject({
      content: 'Appendix page text.',
      wordCount: 3,
    })

    const blockedCount = useAppStore.getState().deletePages(['page-appendix-1'])

    state = useAppStore.getState()
    orderedPages = getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages)
    expect(blockedCount).toBe(0)
    expect(orderedPages.map((page) => page.id)).toEqual(['page-appendix-1'])
  })

  it('prevents deleting the final remaining structured page', () => {
    const document = useAppStore.getState().createDocument({
      title: 'Single page book',
      content: 'Only remaining page.',
      sourceType: 'paste',
    })
    const page = useAppStore.getState().documentPages.find((candidate) => candidate.documentId === document.id)!

    const deleted = useAppStore.getState().deletePage(page.id)

    const state = useAppStore.getState()
    expect(deleted).toBe(false)
    expect(state.documentPages.filter((candidate) => candidate.documentId === document.id)).toHaveLength(1)
    expect(state.documents.find((candidate) => candidate.id === document.id)?.content).toBe('Only remaining page.')
  })

  it('renders untitled pages from source page defaults without overwriting custom labels', () => {
    buildStructuredDocumentFixture()
    let page = useAppStore.getState().documentPages.find((candidate) => candidate.id === 'page-intro-1')!

    expect(getDocumentPageDisplayTitle(page)).toBe('Page 21')

    useAppStore.getState().updatePageMetadata(page.id, { sourcePageNumber: 101 })
    page = useAppStore.getState().documentPages.find((candidate) => candidate.id === 'page-intro-1')!
    expect(getDocumentPageDisplayTitle(page)).toBe('Page 101')

    useAppStore.getState().updatePageMetadata(page.id, { title: 'Opening page', sourcePageNumber: 102 })
    page = useAppStore.getState().documentPages.find((candidate) => candidate.id === 'page-intro-1')!
    expect(getDocumentPageDisplayTitle(page)).toBe('Opening page')
  })

  it('reorders chapters and regenerates reader text in chapter/page order', () => {
    const document = buildStructuredDocumentFixture()
    const appendix = useAppStore.getState().documentChapters.find((chapter) => chapter.title === 'Appendix')!

    useAppStore.getState().moveChapter(document.id, appendix.id, -1)

    const state = useAppStore.getState()
    const orderedChapters = state.documentChapters
      .filter((chapter) => chapter.documentId === document.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const orderedPages = getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages)

    expect(orderedChapters.map((chapter) => chapter.title)).toEqual(['Appendix', 'Introduction'])
    expect(orderedPages.map((page) => page.id)).toEqual(['page-appendix-1', 'page-intro-1', 'page-intro-2'])
    expect(orderedPages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(state.documents[0].content).toBe(
      ['Appendix page text.', 'First introduction page.', 'Second introduction page.'].join('\n\n\f\n\n'),
    )
  })

  it('deletes a chapter by moving its pages to the nearest remaining chapter', () => {
    const document = buildStructuredDocumentFixture()
    const appendix = useAppStore.getState().documentChapters.find((chapter) => chapter.title === 'Appendix')!

    const deleted = useAppStore.getState().deleteChapter(appendix.id)

    const state = useAppStore.getState()
    expect(deleted).toBe(true)
    expect(state.documentChapters.filter((chapter) => chapter.documentId === document.id).map((chapter) => chapter.title)).toEqual([
      'Introduction',
    ])
    expect(getOrderedDocumentPages(document.id, state.documentChapters, state.documentPages).map((page) => page.id)).toEqual([
      'page-intro-1',
      'page-intro-2',
      'page-appendix-1',
    ])
    expect(state.documents[0].content).toContain('Appendix page text.')
  })

  it('creates, renames, and deletes empty chapters without changing page records', () => {
    const document = useAppStore.getState().createDocument({
      title: 'Single chapter book',
      content: 'Only page text.',
      sourceType: 'paste',
    })

    const chapter = useAppStore.getState().createChapter(document.id, 'Notes')!
    useAppStore.getState().renameChapter(chapter.id, 'Reading notes')
    const deleted = useAppStore.getState().deleteChapter(chapter.id)

    const state = useAppStore.getState()
    expect(deleted).toBe(true)
    expect(state.documentChapters.filter((candidate) => candidate.documentId === document.id)).toHaveLength(1)
    expect(state.documentPages.filter((page) => page.documentId === document.id)).toHaveLength(1)
    expect(state.documents[0].content).toBe('Only page text.')
  })

  it('archives structured documents without orphaning local structured data or history', () => {
    const document = buildStructuredDocumentFixture()
    const session: ReadingSession = {
      id: 'session-structured',
      documentId: document.id,
      mode: 'rail',
      targetWpm: 240,
      actualWpm: 220,
      adjustedWpm: 210,
      wordsRead: 6,
      durationSeconds: 2,
      startPosition: 0,
      endPosition: 6,
      pauseCount: 0,
      regressionCount: 0,
      comprehensionScore: 90,
      selfRating: null,
      notes: '',
      startedAt: '2026-05-11T12:00:00.000Z',
      endedAt: '2026-05-11T12:00:02.000Z',
    }
    const quizAttempt: QuizAttempt = {
      id: 'quiz-structured',
      documentId: document.id,
      readingSessionId: session.id,
      kind: 'generated',
      scopeType: 'document',
      scopeLabel: null,
      chapterId: null,
      chapterTitle: null,
      pageIds: [],
      pageNumbers: [],
      sourcePageNumbers: [],
      startWordIndex: 0,
      endWordIndex: 6,
      wordCount: 6,
      durationSeconds: 2,
      targetWpm: 240,
      rawWpm: 220,
      comprehensionPercent: 90,
      adjustedWpm: 210,
      recommendedWpm: 215,
      explanation: 'Steady.',
      questionResults: [],
      questions: [],
      createdAt: '2026-05-11T12:00:03.000Z',
    }
    useAppStore.setState({
      sessions: [session],
      quizAttempts: [quizAttempt],
    })

    useAppStore.getState().archiveDocument(document.id)

    const state = useAppStore.getState()
    expect(state.documents[0].archivedAt).toBeTruthy()
    expect(state.activeDocumentId).toBeNull()
    expect(state.documentChapters.filter((chapter) => chapter.documentId === document.id)).toHaveLength(2)
    expect(state.documentPages.filter((page) => page.documentId === document.id)).toHaveLength(3)
    expect(state.sessions).toEqual([session])
    expect(state.quizAttempts).toEqual([quizAttempt])

    useAppStore.getState().resetAllData()

    expect(useAppStore.getState().sessions).toEqual([])
    expect(useAppStore.getState().quizAttempts).toEqual([])
  })

  it('persists scoped Reader session metadata', () => {
    const document = buildStructuredDocumentFixture()

    const session = useAppStore.getState().completeSession({
      documentId: document.id,
      scope: {
        scopeType: 'pages',
        scopeLabel: 'Introduction, pages 1-2',
        chapterId: 'chapter-intro',
        chapterTitle: 'Introduction',
        pageIds: ['page-intro-1', 'page-intro-2'],
        pageNumbers: [1, 2],
        sourcePageNumbers: [1, 2],
      },
      mode: 'rail',
      targetWpm: 240,
      wordsRead: 6,
      durationSeconds: 2,
      startPosition: 0,
      endPosition: 6,
      pauseCount: 0,
      regressionCount: 0,
      comprehensionScore: 90,
      selfRating: null,
      notes: '',
    })

    expect(session).toMatchObject({
      documentId: document.id,
      scopeType: 'pages',
      scopeLabel: 'Introduction, pages 1-2',
      chapterId: 'chapter-intro',
      chapterTitle: 'Introduction',
      pageIds: ['page-intro-1', 'page-intro-2'],
      pageNumbers: [1, 2],
      sourcePageNumbers: [1, 2],
      startPosition: 0,
      endPosition: 6,
    })
    expect(useAppStore.getState().sessions[0]).toEqual(session)
  })

  it('updates page labels and source page numbers without replacing the page', () => {
    const document = buildStructuredDocumentFixture()

    useAppStore.getState().updatePageMetadata('page-intro-1', {
      title: 'Opening page',
      sourcePageNumber: 101,
    })

    const state = useAppStore.getState()
    const page = state.documentPages.find((candidate) => candidate.id === 'page-intro-1')!
    expect(page).toMatchObject({
      id: 'page-intro-1',
      documentId: document.id,
      title: 'Opening page',
      sourcePageNumber: 101,
      text: 'First introduction page.',
    })
  })

  it('stores OCR import jobs with ordered item metadata, warnings, and target structure', () => {
    const document = buildStructuredDocumentFixture()
    const chapter = useAppStore.getState().documentChapters.find((candidate) => candidate.documentId === document.id)!
    const job: OcrJob = {
      id: 'ocr-job-1',
      documentId: document.id,
      targetChapterId: chapter.id,
      status: 'review',
      modelId: 'gemini-3.1-flash-lite',
      inputFileCount: 2,
      promptVersion: 'structured-import-v1',
      warnings: ['bad-page.png: OCR failed'],
      errorMessage: null,
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:00:05.000Z',
      completedAt: '2026-05-11T12:00:05.000Z',
    }
    const items: OcrJobItem[] = [
      buildOcrJobItem({
        id: 'ocr-item-2',
        jobId: job.id,
        orderIndex: 1,
        sourceFileName: 'bad-page.png',
        sourcePageNumber: 158,
        status: 'failed',
        failureReason: 'OCR failed',
      }),
      buildOcrJobItem({
        id: 'ocr-item-1',
        jobId: job.id,
        orderIndex: 0,
        sourceFileName: 'good-page.png',
        sourcePageNumber: 157,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: 157,
            title: 'Opening',
            text: 'Recovered OCR text.',
            reviewStatus: 'reviewed',
            ocrConfidence: 0.9,
            ocrNotes: null,
            uncertainSpans: [],
            sourceFileName: 'good-page.png',
            sourceKind: 'image',
          },
        ],
        ocrText: 'Recovered OCR text.',
      }),
    ]

    useAppStore.getState().saveOcrJob(job, items)

    const state = useAppStore.getState()
    expect(state.ocrJobs[0]).toMatchObject({
      id: 'ocr-job-1',
      documentId: document.id,
      targetChapterId: chapter.id,
      status: 'review',
      warnings: ['bad-page.png: OCR failed'],
    })
    expect(state.ocrJobItems.filter((item) => item.jobId === job.id).map((item) => item.orderIndex)).toEqual([0, 1])
    expect(state.ocrJobItems[0]).toMatchObject({
      sourceFileName: 'good-page.png',
      sourcePageNumber: 157,
      status: 'review',
      ocrText: 'Recovered OCR text.',
    })
    expect(state.ocrJobItems[1]).toMatchObject({
      sourceFileName: 'bad-page.png',
      sourcePageNumber: 158,
      status: 'failed',
      failureReason: 'OCR failed',
    })
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

function buildStructuredDocumentFixture(): DocumentRecord {
  const document: DocumentRecord = {
    ...buildLegacyDocument({
      id: 'structured-doc',
      title: 'Structured book',
      content: 'First introduction page.\n\n\f\n\nSecond introduction page.\n\n\f\n\nAppendix page text.',
      wordCount: 9,
      sourceType: 'photo_ocr',
    }),
    structureVersion: STRUCTURED_DOCUMENT_VERSION,
  }
  const chapters: DocumentChapterRecord[] = [
    buildChapter({
      id: 'chapter-intro',
      documentId: document.id,
      title: 'Introduction',
      sortOrder: 0,
    }),
    buildChapter({
      id: 'chapter-appendix',
      documentId: document.id,
      title: 'Appendix',
      sortOrder: 1,
    }),
  ]
  const pages: DocumentPageRecord[] = [
    buildPage({
      id: 'page-intro-1',
      documentId: document.id,
      chapterId: 'chapter-intro',
      pageNumber: 1,
      sortOrder: 0,
      sourcePageNumber: 21,
      text: 'First introduction page.',
      wordCount: 3,
    }),
    buildPage({
      id: 'page-intro-2',
      documentId: document.id,
      chapterId: 'chapter-intro',
      pageNumber: 2,
      sortOrder: 1,
      sourcePageNumber: 22,
      text: 'Second introduction page.',
      wordCount: 3,
      reviewStatus: 'needs_attention',
      ocrNotes: 'Preserve this note',
      sourceFileName: 'intro-2.png',
    }),
    buildPage({
      id: 'page-appendix-1',
      documentId: document.id,
      chapterId: 'chapter-appendix',
      pageNumber: 3,
      sortOrder: 0,
      sourcePageNumber: 99,
      text: 'Appendix page text.',
      wordCount: 3,
    }),
  ]

  useAppStore.setState({
    documents: [document],
    documentChapters: chapters,
    documentPages: pages,
    activeDocumentId: document.id,
  })

  return document
}

function buildOcrJobItem(overrides: Partial<OcrJobItem> = {}): OcrJobItem {
  return {
    id: 'ocr-item-1',
    jobId: 'ocr-job-1',
    orderIndex: 0,
    sourceFileName: 'scan.png',
    sourceFileType: 'image/png',
    sourceFileSize: 12,
    sourceFileLastModified: 1_779_000_000_000,
    sourcePageNumber: 1,
    title: null,
    status: 'review',
    ocrText: null,
    pages: [],
    warnings: [],
    failureReason: null,
    createdAt: '2026-05-11T12:00:00.000Z',
    updatedAt: '2026-05-11T12:00:00.000Z',
    ...overrides,
  }
}

function buildChapter(overrides: Partial<DocumentChapterRecord> = {}): DocumentChapterRecord {
  return {
    id: 'chapter-1',
    documentId: 'structured-doc',
    title: 'Chapter',
    sortOrder: 0,
    createdAt: '2026-05-11T12:00:00.000Z',
    updatedAt: '2026-05-11T12:00:00.000Z',
    ...overrides,
  }
}

function buildPage(overrides: Partial<DocumentPageRecord> = {}): DocumentPageRecord {
  return {
    id: 'page-1',
    documentId: 'structured-doc',
    chapterId: 'chapter-1',
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: null,
    title: null,
    text: 'Page text.',
    wordCount: 2,
    reviewStatus: 'reviewed',
    ocrConfidence: 0.9,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: 'image',
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: '2026-05-11T12:00:00.000Z',
    updatedAt: '2026-05-11T12:00:00.000Z',
    ...overrides,
  }
}
