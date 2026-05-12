// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import { generateQuizFromReading } from '../lib/ai/geminiQuiz'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord, ReaderResumeSlot } from '../types/domain'

vi.mock('../lib/ai/geminiQuiz', () => ({
  generateQuizFromReading: vi.fn(),
}))

const generateQuizFromReadingMock = vi.mocked(generateQuizFromReading)

const documentRecord: DocumentRecord = {
  id: 'document-1',
  title: 'Scoped coaching document',
  sourceType: 'photo_ocr',
  content: 'First page words here.\n\n\f\n\nSecond page scoped words.',
  wordCount: 8,
  estimatedPages: 2,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-12T12:00:00.000Z',
  updatedAt: '2026-05-12T12:00:00.000Z',
  archivedAt: null,
}

const chapter: DocumentChapterRecord = {
  id: 'chapter-1',
  documentId: documentRecord.id,
  title: 'Chapter One',
  sortOrder: 0,
  createdAt: documentRecord.createdAt,
  updatedAt: documentRecord.updatedAt,
}

const pages: DocumentPageRecord[] = [
  buildPage('page-1', 1, 'First page words here.', 41),
  buildPage('page-2', 2, 'Second page scoped words.', 42),
]

function buildResumeSlot(overrides: Partial<ReaderResumeSlot> & Pick<ReaderResumeSlot, 'scopeType'>): ReaderResumeSlot {
  const wordIndex = overrides.wordIndex ?? overrides.readThroughWordIndex ?? overrides.cursorWordIndex ?? 0
  return {
    chapterId: null,
    chunkSize: 4,
    cursorWordIndex: wordIndex,
    elapsedSeconds: 0,
    endPageNumber: null,
    mode: 'rail',
    pageLayout: 1,
    pauseCount: 0,
    readThroughWordIndex: wordIndex,
    regressionCount: 0,
    segmentStartElapsedSeconds: 0,
    segmentStartWordIndex: wordIndex,
    startPageNumber: null,
    targetWpm: 250,
    updatedAt: '2026-05-12T12:05:00.000Z',
    wordIndex,
    ...overrides,
    scopeType: overrides.scopeType,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/reader/document-1')
  resetStore()
  generateQuizFromReadingMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('generated coaching flow', () => {
  it('restores the latest saved reader scope and position for generic reader routes', async () => {
    useAppStore.setState((state) => ({
      coaching: {
        ...state.coaching,
        readerResumeByDocument: {
          [documentRecord.id]: {
            pageRanges: {
              [`${chapter.id}:2-2`]: buildResumeSlot({
              scopeType: 'pages',
              chapterId: chapter.id,
              startPageNumber: 2,
              endPageNumber: 2,
              wordIndex: 4,
              chunkSize: 2,
              }),
            },
          },
        },
      },
    }))

    render(<App />)

    await waitFor(() => expect(screen.getAllByText('Chapter One, page 42').length).toBeGreaterThan(0))
    expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('End page')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('Chunk')).toHaveProperty('value', '2')
  })

  it('lets explicit document scope override the latest saved page scope', async () => {
    useAppStore.setState((state) => ({
      coaching: {
        ...state.coaching,
        readerResumeByDocument: {
          [documentRecord.id]: {
            pageRanges: {
              [`${chapter.id}:2-2`]: buildResumeSlot({
              scopeType: 'pages',
              chapterId: chapter.id,
              startPageNumber: 2,
              endPageNumber: 2,
              wordIndex: 4,
              chunkSize: 2,
              }),
            },
          },
        },
      },
    }))

    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2'))

    await userEvent.click(screen.getByRole('button', { name: 'Document' }))

    await waitFor(() => expect(screen.queryByLabelText('Start page')).toBeNull())
    expect(screen.getAllByText('Full document').length).toBeGreaterThan(0)
  })

  it('restores saved page range and reader controls after play, scope switches, and reopening from the library', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/reader/document-1/chapters/chapter-1/pages/2/2')

    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2'))
    await user.click(screen.getByRole('button', { name: 'Chunk' }))
    await user.click(screen.getByRole('button', { name: '2 panes' }))
    fireEvent.change(screen.getByLabelText('WPM'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Chunk'), { target: { value: '2' } })

    await user.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => {
      expect(useAppStore.getState().coaching.readerResumeByDocument[documentRecord.id]?.pageRanges?.[`${chapter.id}:2-2`]).toMatchObject({
        scopeType: 'pages',
        chapterId: chapter.id,
        startPageNumber: 2,
        endPageNumber: 2,
        wordIndex: 8,
        chunkSize: 2,
        mode: 'chunk',
        pageLayout: 2,
        targetWpm: 300,
      })
    })

    await user.click(screen.getByRole('button', { name: 'Document' }))
    await waitFor(() => expect(screen.queryByLabelText('Start page')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Chapter' }))
    await waitFor(() => expect(screen.queryByLabelText('Start page')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Pages' }))

    await waitFor(() => expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2'))
    expect(screen.getByLabelText('End page')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('Chunk')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('WPM')).toHaveProperty('value', '300')
    expect(screen.getByRole('button', { name: 'Chunk' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('button', { name: '2 panes' }).classList.contains('active')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Back to library' }))
    await user.click(screen.getByRole('button', { name: 'Read' }))

    await waitFor(() => expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2'))
    expect(screen.getByLabelText('End page')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('Chunk')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('WPM')).toHaveProperty('value', '300')
    expect(screen.getByRole('button', { name: 'Chunk' }).classList.contains('active')).toBe(true)
    expect(screen.getByRole('button', { name: '2 panes' }).classList.contains('active')).toBe(true)
  })

  it('prefers explicit reader URLs over saved resume scope', async () => {
    window.history.replaceState(null, '', '/reader/document-1/chapters/chapter-1')
    useAppStore.setState((state) => ({
      coaching: {
        ...state.coaching,
        readerResumeByDocument: {
          [documentRecord.id]: {
            pageRanges: {
              [`${chapter.id}:2-2`]: buildResumeSlot({
              scopeType: 'pages',
              chapterId: chapter.id,
              startPageNumber: 2,
              endPageNumber: 2,
              wordIndex: 4,
              chunkSize: 2,
              }),
            },
          },
        },
      },
    }))

    render(<App />)

    await waitFor(() => expect(screen.getAllByText('Chapter One').length).toBeGreaterThan(0))
    expect(screen.queryByLabelText('Start page')).toBeNull()
  })

  it('updates the active scope resume slot when reading pauses', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => {
      expect(useAppStore.getState().coaching.readerResumeByDocument[documentRecord.id]?.document).toMatchObject({
        scopeType: 'document',
        chapterId: null,
        startPageNumber: null,
        endPageNumber: null,
        wordIndex: 4,
        chunkSize: 4,
      })
    })
    expect(useAppStore.getState().coaching.readerResumeByDocument[documentRecord.id]?.pageRanges).toBeUndefined()
  })

  it('falls back gracefully when a saved chapter no longer exists', async () => {
    useAppStore.setState((state) => ({
      coaching: {
        ...state.coaching,
        readerResumeByDocument: {
          [documentRecord.id]: {
            chapters: {
              'missing-chapter': buildResumeSlot({
              scopeType: 'chapter',
              chapterId: 'missing-chapter',
              startPageNumber: null,
              endPageNumber: null,
              wordIndex: 999,
              chunkSize: 3,
              }),
            },
          },
        },
      },
    }))

    render(<App />)

    await waitFor(() => expect(screen.getAllByText('Chapter One').length).toBeGreaterThan(0))
    expect(screen.getByLabelText('Chapter')).toHaveProperty('value', chapter.id)
    expect(screen.getByLabelText('Chunk')).toHaveProperty('value', '3')
  })

  it('generates a full-document quiz from the completed reader segment with document attribution', async () => {
    const user = userEvent.setup()
    generateQuizFromReadingMock.mockImplementation(async (_apiKey, _title, _content, _wordCount, options) => {
      options?.recordUsage?.({
        documentId: options.usageAttribution?.documentId ?? null,
        stage: 'generated_quiz',
        provider: 'google',
        model: 'gemini-3-flash-preview',
        status: 'succeeded',
        startedAt: '2026-05-12T12:00:00.000Z',
        completedAt: '2026-05-12T12:00:01.000Z',
        failureMessage: null,
        rawProviderMetadata: null,
        tokenBreakdown: null,
        pricingSnapshot: null,
      })
      return buildQuiz()
    })

    render(<App />)
    await saveBrowserGeminiKey(user)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => expect(generateQuizFromReadingMock).toHaveBeenCalledTimes(1))
    expect(generateQuizFromReadingMock.mock.calls[0].slice(0, 4)).toEqual([
      'browser-test-key',
      'Scoped coaching document',
      'First page words here.',
      4,
    ])
    expect(generateQuizFromReadingMock.mock.calls[0][4]).toMatchObject({
      usageAttribution: {
        documentId: 'document-1',
      },
    })
    expect(useAppStore.getState().aiUsageLineItems[0]).toMatchObject({
      documentId: 'document-1',
      stage: 'generated_quiz',
      status: 'succeeded',
    })
  })

  it('excludes a large unread suffix from generated quiz text and pending word counts', async () => {
    const user = userEvent.setup()
    const readSegment = 'First segment words here.'
    const unreadSuffix = Array.from({ length: 1_200 }, (_, index) => `unread${index}`).join(' ')
    const largeDocument: DocumentRecord = {
      ...documentRecord,
      content: `${readSegment}\n\n\f\n\n${unreadSuffix}`,
      wordCount: 1_204,
    }
    const largePages = [
      buildPage('page-1', 1, readSegment, 41),
      buildPage('page-2', 2, unreadSuffix, 42),
    ]
    useAppStore.setState({
      documents: [largeDocument],
      documentPages: largePages,
    })
    generateQuizFromReadingMock
      .mockRejectedValueOnce(new Error('quiz provider unavailable'))
      .mockResolvedValueOnce(buildQuiz())

    render(<App />)
    await saveBrowserGeminiKey(user)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('quiz provider unavailable')).toBeTruthy()
    const firstGeneratedContent = generateQuizFromReadingMock.mock.calls[0][2]
    expect(generateQuizFromReadingMock.mock.calls[0].slice(0, 4)).toEqual([
      'browser-test-key',
      'Scoped coaching document',
      'First segment words here.',
      4,
    ])
    expect(firstGeneratedContent).not.toContain('unread0')
    expect(firstGeneratedContent).not.toContain('unread1199')

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(generateQuizFromReadingMock).toHaveBeenCalledTimes(2))
    const retryGeneratedContent = generateQuizFromReadingMock.mock.calls[1][2]
    expect(generateQuizFromReadingMock.mock.calls[1].slice(0, 4)).toEqual([
      'browser-test-key',
      'Scoped coaching document',
      'First segment words here.',
      4,
    ])
    expect(retryGeneratedContent).not.toContain('unread0')
    expect(retryGeneratedContent).not.toContain('unread1199')

    await user.click(await screen.findByLabelText('Practice improves comprehension.'))
    await user.click(screen.getByLabelText('Questions are skipped.'))
    await user.click(screen.getByRole('button', { name: 'Save quiz result' }))

    await waitFor(() => expect(window.location.pathname).toBe('/progress'))
    const state = useAppStore.getState()
    expect(state.sessions[0]).toMatchObject({
      startPosition: 0,
      endPosition: 4,
      wordsRead: 4,
    })
    expect(state.quizAttempts[0]).toMatchObject({
      startWordIndex: 0,
      endWordIndex: 4,
      wordCount: 4,
    })
  })

  it('saves generated quiz attempts with selected page scope metadata and review details', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/reader/document-1/chapters/chapter-1/pages/2/2')
    generateQuizFromReadingMock.mockResolvedValue(buildQuiz())

    render(<App />)
    await saveBrowserGeminiKey(user, '/reader/document-1/chapters/chapter-1/pages/2/2')

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() => expect(generateQuizFromReadingMock).toHaveBeenCalledTimes(1))
    expect(generateQuizFromReadingMock.mock.calls[0].slice(0, 4)).toEqual([
      'browser-test-key',
      'Scoped coaching document - Chapter One, page 42',
      'Second page scoped words.',
      4,
    ])

    await user.click(await screen.findByLabelText('Practice improves comprehension.'))
    await user.click(screen.getByLabelText('Questions are skipped.'))
    await user.click(screen.getByRole('button', { name: 'Save quiz result' }))

    await waitFor(() => expect(window.location.pathname).toBe('/progress'))
    const state = useAppStore.getState()

    expect(state.sessions[0]).toMatchObject({
      documentId: 'document-1',
      scopeType: 'pages',
      scopeLabel: 'Chapter One, page 42',
      chapterId: 'chapter-1',
      chapterTitle: 'Chapter One',
      pageIds: ['page-2'],
      pageNumbers: [2],
      sourcePageNumbers: [42],
      startPosition: 4,
      endPosition: 8,
      wordsRead: 4,
      comprehensionScore: 50,
    })
    expect(state.quizAttempts[0]).toMatchObject({
      kind: 'generated',
      documentId: 'document-1',
      readingSessionId: state.sessions[0].id,
      scopeType: 'pages',
      scopeLabel: 'Chapter One, page 42',
      chapterId: 'chapter-1',
      chapterTitle: 'Chapter One',
      pageIds: ['page-2'],
      pageNumbers: [2],
      sourcePageNumbers: [42],
      startWordIndex: 4,
      endWordIndex: 8,
      wordCount: 4,
      comprehensionPercent: 50,
    })
    expect(state.quizAttempts[0].questionResults).toHaveLength(2)
    expect(state.quizAttempts[0].questions).toEqual([
      expect.objectContaining({
        questionId: 'q1',
        correctOptionId: 'q1-a',
        selectedOptionId: 'q1-a',
        score: 1,
      }),
      expect.objectContaining({
        questionId: 'q2',
        correctOptionId: 'q2-b',
        selectedOptionId: 'q2-a',
        score: 0,
      }),
    ])
  })

  it('keeps missing-key quiz attempts recoverable without calling Gemini', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByRole('heading', { name: 'Quiz unavailable' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save manual check' })).toBeTruthy()
    expect(generateQuizFromReadingMock).not.toHaveBeenCalled()
  })

  it('keeps provider failures recoverable and retries the scoped generation request', async () => {
    const user = userEvent.setup()
    generateQuizFromReadingMock
      .mockRejectedValueOnce(new Error('quiz provider unavailable'))
      .mockResolvedValueOnce(buildQuiz())

    render(<App />)
    await saveBrowserGeminiKey(user)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('quiz provider unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save manual check' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(generateQuizFromReadingMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Reading check' })).toBeTruthy()
    expect(generateQuizFromReadingMock.mock.calls[1].slice(0, 4)).toEqual([
      'browser-test-key',
      'Scoped coaching document',
      'First page words here.',
      4,
    ])
  })
})

async function saveBrowserGeminiKey(
  user: ReturnType<typeof userEvent.setup>,
  returnPath = '/reader/document-1',
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  await user.type(screen.getByLabelText('API key'), 'browser-test-key')
  await user.click(screen.getByRole('button', { name: 'Save key' }))
  window.history.pushState(null, '', returnPath)
  window.dispatchEvent(new PopStateEvent('popstate'))
  await screen.findByRole('heading', { name: 'Scoped coaching document' })
}

function resetStore(): void {
  useAppStore.setState({
    documents: [documentRecord],
    documentChapters: [chapter],
    documentPages: pages,
    ocrJobs: [],
    ocrJobItems: [],
    ocrRuntimeJobs: {},
    aiUsageLineItems: [],
    sessions: [],
    activeDocumentId: documentRecord.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: documentRecord.createdAt,
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'progress', 'costs', 'stats', 'settings'],
    },
    baselineResult: null,
    quizAttempts: [],
    coaching: {
      recommendedWpm: 250,
      lastResetWordIndexByDocument: {},
      activeSegmentByDocument: {},
      readerResumeByDocument: {},
    },
  })
}

function buildPage(
  id: string,
  pageNumber: number,
  text: string,
  sourcePageNumber: number | null,
): DocumentPageRecord {
  return {
    id,
    documentId: documentRecord.id,
    chapterId: chapter.id,
    sortOrder: pageNumber - 1,
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

function buildQuiz() {
  return {
    title: 'Reading check',
    questions: [
      {
        id: 'q1',
        kind: 'main_idea' as const,
        prompt: 'What is the main idea?',
        correctOptionId: 'q1-a',
        options: [
          { id: 'q1-a', label: 'Practice improves comprehension.' },
          { id: 'q1-b', label: 'Speed is the only goal.' },
          { id: 'q1-c', label: 'The passage is about weather.' },
          { id: 'q1-d', label: 'The passage rejects testing.' },
        ],
      },
      {
        id: 'q2',
        kind: 'detail' as const,
        prompt: 'Which detail is supported?',
        correctOptionId: 'q2-b',
        options: [
          { id: 'q2-a', label: 'Questions are skipped.' },
          { id: 'q2-b', label: 'Comprehension is checked.' },
          { id: 'q2-c', label: 'No results are stored.' },
          { id: 'q2-d', label: 'Settings are deleted.' },
        ],
      },
    ],
  }
}
