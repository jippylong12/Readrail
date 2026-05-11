import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  BaselineAssessmentResult,
  CoachingState,
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  OcrReviewStatus,
  OcrUncertainSpan,
  OnboardingState,
  PageLayout,
  ReaderMode,
  ReadingSession,
  SourceType,
  TourProgressState,
  QuizAttempt,
} from '../types/domain'
import { calculateAdjustedWpm, calculateActualWpm } from '../lib/reading/pacing'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords, estimatePages } from '../lib/text/wordCount'
import { saveDocumentToDatabase, saveSessionToDatabase } from '../lib/db/repository'
import {
  STRUCTURED_DOCUMENT_VERSION,
  createDefaultDocumentStructure,
  defaultDocumentChapterId,
  defaultDocumentPageId,
  ensureStructuredDocumentCollections,
} from './structuredDocuments'

type CreateDocumentInput = {
  title: string
  content: string
  sourceType: SourceType
}

export type OcrPageInput = {
  pageNumber: number
  text: string
  reviewStatus: OcrReviewStatus
  sourcePageNumber: number | null
  ocrConfidence: number | null
  ocrNotes: string | null
  uncertainSpans: OcrUncertainSpan[]
  sourceFileName: string | null
  sourceKind: DocumentPageRecord['sourceKind']
}

type CreateOcrDocumentInput = {
  title: string
  pages: OcrPageInput[]
}

type CompleteSessionInput = {
  documentId: string
  mode: ReaderMode
  targetWpm: number
  wordsRead: number
  durationSeconds: number
  startPosition?: number
  endPosition?: number
  pauseCount: number
  regressionCount: number
  comprehensionScore: number | null
  selfRating: number | null
  notes: string
}

type AppState = {
  documents: DocumentRecord[]
  documentChapters: DocumentChapterRecord[]
  documentPages: DocumentPageRecord[]
  sessions: ReadingSession[]
  activeDocumentId: string | null
  settings: AppSettings
  onboarding: OnboardingState
  tourProgress: TourProgressState
  baselineResult: BaselineAssessmentResult | null
  quizAttempts: QuizAttempt[]
  coaching: CoachingState
  createDocument: (input: CreateDocumentInput) => DocumentRecord
  createOcrDocument: (input: CreateOcrDocumentInput) => DocumentRecord
  appendOcrPagesToDocument: (documentId: string, pages: OcrPageInput[]) => DocumentRecord | null
  updateDocument: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
  archiveDocument: (id: string) => void
  setActiveDocument: (id: string | null) => void
  completeSession: (input: CompleteSessionInput) => ReadingSession
  updateSettings: (settings: Partial<AppSettings>) => void
  saveBaselineResult: (result: BaselineAssessmentResult) => void
  skipOnboarding: () => void
  completeOnboardingIntro: () => void
  reopenOnboarding: () => void
  completeTour: (tourId: string) => void
  resetTour: (tourId: string) => void
  resetAllTours: () => void
  addQuizAttempt: (attempt: QuizAttempt) => void
  resetCoachingSegment: (documentId: string, wordIndex: number) => void
  startCoachingSegment: (documentId: string, segment: CoachingState['activeSegmentByDocument'][string]) => void
  resetAllData: () => void
}

const defaultSettings: AppSettings = {
  reader: {
    defaultWpm: 250,
    defaultMode: 'rail',
    defaultPageLayout: 1 as PageLayout,
    chunkSize: 4,
    fontFamily: 'system',
    fontSize: 20,
    lineHeight: 1.65,
    theme: 'system',
    reducedMotion: false,
  },
  privacy: {
    retainSourceImages: false,
    confirmRemoteOcrEachTime: true,
  },
  ocr: {
    modelId: 'gemini-3.1-flash-lite',
    preservePageBreaks: true,
  },
}

export const defaultOnboardingState: OnboardingState = {
  status: 'not_started',
  skippedAt: null,
  introCompletedAt: null,
}

export const defaultTourProgressState: TourProgressState = {
  completedTourIds: [],
}

function buildDefaultCoachingState(recommendedWpm = defaultSettings.reader.defaultWpm): CoachingState {
  return {
    recommendedWpm,
    lastResetWordIndexByDocument: {},
    activeSegmentByDocument: {},
  }
}

function renderStructuredContentFromPages(pages: Array<Pick<DocumentPageRecord, 'sortOrder' | 'text'>>): string {
  return [...pages]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join('\n\n\f\n\n')
}

function buildOcrPages(
  documentId: string,
  chapterId: string,
  pages: OcrPageInput[],
  now: string,
  startSortOrder = 0,
  startPageNumber = 1,
): DocumentPageRecord[] {
  return pages.map((page, index) => {
    const text = cleanReadingText(page.text, { preservePageBreaks: true })
    return {
      id: crypto.randomUUID(),
      documentId,
      chapterId,
      sortOrder: startSortOrder + index,
      pageNumber: startPageNumber + index,
      sourcePageNumber: page.sourcePageNumber ?? page.pageNumber ?? null,
      title: null,
      text,
      wordCount: countWords(text),
      reviewStatus: page.reviewStatus,
      ocrConfidence: page.ocrConfidence,
      ocrNotes: page.ocrNotes,
      uncertainSpans: page.uncertainSpans,
      sourceFileId: null,
      sourceFileName: page.sourceFileName,
      sourceKind: page.sourceKind,
      sourceLocalPath: null,
      sourceSha256: null,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      documents: [],
      documentChapters: [],
      documentPages: [],
      sessions: [],
      activeDocumentId: null,
      settings: defaultSettings,
      onboarding: defaultOnboardingState,
      tourProgress: defaultTourProgressState,
      baselineResult: null,
      quizAttempts: [],
      coaching: buildDefaultCoachingState(),
      createDocument: (input) => {
        const now = new Date().toISOString()
        const content = cleanReadingText(input.content, { preservePageBreaks: true })
        const wordCount = countWords(content)
        const document: DocumentRecord = {
          id: crypto.randomUUID(),
          title: input.title.trim() || 'Untitled reading',
          sourceType: input.sourceType,
          content,
          wordCount,
          estimatedPages: estimatePages(wordCount),
          language: 'en',
          structureVersion: STRUCTURED_DOCUMENT_VERSION,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }
        const structure = createDefaultDocumentStructure(document)

        set((state) => ({
          documents: [document, ...state.documents],
          documentChapters: [structure.chapter, ...state.documentChapters],
          documentPages: [structure.page, ...state.documentPages],
          activeDocumentId: document.id,
        }))
        void saveDocumentToDatabase(document, {
          chapters: [structure.chapter],
          pages: [structure.page],
        })

        return document
      },
      createOcrDocument: (input) => {
        const now = new Date().toISOString()
        const documentId = crypto.randomUUID()
        const chapter: DocumentChapterRecord = {
          id: defaultDocumentChapterId(documentId),
          documentId,
          title: 'Main text',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        }
        const pages = buildOcrPages(documentId, chapter.id, input.pages, now)
        const content = renderStructuredContentFromPages(pages)
        const wordCount = pages.reduce((total, page) => total + page.wordCount, 0)
        const document: DocumentRecord = {
          id: documentId,
          title: input.title.trim() || 'Untitled OCR import',
          sourceType: 'photo_ocr',
          content,
          wordCount,
          estimatedPages: estimatePages(wordCount),
          language: 'en',
          structureVersion: STRUCTURED_DOCUMENT_VERSION,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }

        set((state) => ({
          documents: [document, ...state.documents],
          documentChapters: [chapter, ...state.documentChapters],
          documentPages: [...pages, ...state.documentPages],
          activeDocumentId: document.id,
        }))
        void saveDocumentToDatabase(document, {
          chapters: [chapter],
          pages,
        })

        return document
      },
      appendOcrPagesToDocument: (documentId, inputPages) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapter: DocumentChapterRecord | null = null
        let addedPages: DocumentPageRecord[] = []

        set((state) => {
          const document = state.documents.find((candidate) => candidate.id === documentId)
          if (!document) {
            return state
          }

          const documentChapters = state.documentChapters
            .filter((chapter) => chapter.documentId === documentId)
            .sort((left, right) => left.sortOrder - right.sortOrder)
          const fallbackChapter: DocumentChapterRecord = {
            id: defaultDocumentChapterId(documentId),
            documentId,
            title: 'Main text',
            sortOrder: 0,
            createdAt: document.createdAt,
            updatedAt: now,
          }
          const targetChapter = documentChapters[documentChapters.length - 1] ?? fallbackChapter
          changedChapter = documentChapters.length === 0 ? targetChapter : null

          const existingPages = state.documentPages
            .filter((page) => page.documentId === documentId)
            .sort((left, right) => left.sortOrder - right.sortOrder)
          const maxSortOrder = existingPages.reduce((max, page) => Math.max(max, page.sortOrder), -1)
          const maxPageNumber = existingPages.reduce((max, page) => Math.max(max, page.pageNumber), 0)
          addedPages = buildOcrPages(documentId, targetChapter.id, inputPages, now, maxSortOrder + 1, maxPageNumber + 1)
          const nextPages = [...existingPages, ...addedPages]
          const wordCount = nextPages.reduce((total, page) => total + page.wordCount, 0)
          changedDocument = {
            ...document,
            content: renderStructuredContentFromPages(nextPages),
            wordCount,
            estimatedPages: estimatePages(wordCount),
            updatedAt: now,
          }

          return {
            documents: state.documents.map((candidate) => (candidate.id === documentId ? changedDocument! : candidate)),
            documentChapters: changedChapter ? [changedChapter, ...state.documentChapters] : state.documentChapters,
            documentPages: [...state.documentPages, ...addedPages],
            activeDocumentId: documentId,
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapter ? [changedChapter] : undefined,
            pages: addedPages,
          })
        }

        return changedDocument
      },
      updateDocument: (id, updates) => {
        const updatedAt = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedPage: DocumentPageRecord | null = null

        set((state) => {
          return {
            documents: state.documents.map((document) => {
              if (document.id !== id) {
                return document
              }

              const content =
                updates.content !== undefined
                  ? cleanReadingText(updates.content, { preservePageBreaks: true })
                  : document.content
              const title = updates.title !== undefined ? updates.title.trim() || 'Untitled reading' : document.title
              const wordCount = countWords(content)
              changedDocument = {
                ...document,
                title,
                content,
                wordCount,
                estimatedPages: estimatePages(wordCount),
                updatedAt,
              }
              return changedDocument
            }),
            documentPages:
              updates.content === undefined
                ? state.documentPages
                : state.documentPages.map((page) => {
                    if (page.id !== defaultDocumentPageId(id)) {
                      return page
                    }

                    const content = cleanReadingText(updates.content ?? '', { preservePageBreaks: true })
                    changedPage = {
                      ...page,
                      text: content,
                      wordCount: countWords(content),
                      updatedAt,
                    }
                    return changedPage
                  }),
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, changedPage ? { pages: [changedPage] } : undefined)
        }
      },
      archiveDocument: (id) => {
        const updatedAt = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null

        set((state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== id) {
              return document
            }

            changedDocument = { ...document, archivedAt: updatedAt, updatedAt }
            return changedDocument
          }),
          activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
        }))

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument)
        }
      },
      setActiveDocument: (id) => set({ activeDocumentId: id }),
      completeSession: (input) => {
        const now = new Date()
        const actualWpm = calculateActualWpm(input.wordsRead, input.durationSeconds)
        const session: ReadingSession = {
          id: crypto.randomUUID(),
          documentId: input.documentId,
          mode: input.mode,
          targetWpm: input.targetWpm,
          actualWpm,
          adjustedWpm: calculateAdjustedWpm(actualWpm, input.comprehensionScore),
          wordsRead: input.wordsRead,
          durationSeconds: input.durationSeconds,
          startPosition: input.startPosition ?? 0,
          endPosition: input.endPosition ?? input.wordsRead,
          pauseCount: input.pauseCount,
          regressionCount: input.regressionCount,
          comprehensionScore: input.comprehensionScore,
          selfRating: input.selfRating,
          notes: input.notes,
          startedAt: new Date(now.getTime() - input.durationSeconds * 1000).toISOString(),
          endedAt: now.toISOString(),
        }

        set((state) => ({ sessions: [session, ...state.sessions] }))
        void saveSessionToDatabase(session)

        return session
      },
      updateSettings: (settings) => {
        set((state) => ({
          settings: {
            reader: { ...state.settings.reader, ...settings.reader },
            privacy: { ...state.settings.privacy, ...settings.privacy },
            ocr: { ...state.settings.ocr, ...settings.ocr },
          },
        }))
      },
      saveBaselineResult: (result) => {
        set((state) => ({
          baselineResult: {
            ...result,
            appliedWpmAt: new Date().toISOString(),
          },
          settings: {
            ...state.settings,
            reader: {
              ...state.settings.reader,
              defaultWpm: result.recommendedWpm,
            },
          },
          coaching: {
            ...state.coaching,
            recommendedWpm: result.recommendedWpm,
          },
        }))
      },
      skipOnboarding: () => {
        set({
          onboarding: {
            status: 'skipped',
            skippedAt: new Date().toISOString(),
            introCompletedAt: null,
          },
        })
      },
      completeOnboardingIntro: () => {
        set({
          onboarding: {
            status: 'intro_completed',
            skippedAt: null,
            introCompletedAt: new Date().toISOString(),
          },
        })
      },
      reopenOnboarding: () => set({ onboarding: defaultOnboardingState }),
      completeTour: (tourId) => {
        set((state) => {
          if (state.tourProgress.completedTourIds.includes(tourId)) {
            return state
          }

          return {
            tourProgress: {
              completedTourIds: [...state.tourProgress.completedTourIds, tourId],
            },
          }
        })
      },
      resetTour: (tourId) => {
        set((state) => ({
          tourProgress: {
            completedTourIds: state.tourProgress.completedTourIds.filter((completedTourId) => completedTourId !== tourId),
          },
        }))
      },
      resetAllTours: () => set({ tourProgress: defaultTourProgressState }),
      addQuizAttempt: (attempt) =>
        set((state) => ({
          quizAttempts: [attempt, ...state.quizAttempts],
          coaching: {
            ...state.coaching,
            recommendedWpm: attempt.recommendedWpm,
            lastResetWordIndexByDocument: {
              ...state.coaching.lastResetWordIndexByDocument,
              [attempt.documentId]: attempt.endWordIndex,
            },
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [attempt.documentId]: {
                startWordIndex: attempt.endWordIndex,
                startedAt: null,
                targetWpm: attempt.recommendedWpm,
              },
            },
          },
        })),
      resetCoachingSegment: (documentId, wordIndex) =>
        set((state) => ({
          coaching: {
            ...state.coaching,
            lastResetWordIndexByDocument: {
              ...state.coaching.lastResetWordIndexByDocument,
              [documentId]: Math.max(0, Math.round(wordIndex)),
            },
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [documentId]: {
                startWordIndex: Math.max(0, Math.round(wordIndex)),
                startedAt: null,
                targetWpm: state.coaching.recommendedWpm,
              },
            },
          },
        })),
      startCoachingSegment: (documentId, segment) =>
        set((state) => ({
          coaching: {
            ...state.coaching,
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [documentId]: segment,
            },
          },
        })),
      resetAllData: () =>
        set({
          documents: [],
          documentChapters: [],
          documentPages: [],
          sessions: [],
          activeDocumentId: null,
          onboarding: defaultOnboardingState,
          tourProgress: defaultTourProgressState,
          baselineResult: null,
          quizAttempts: [],
          coaching: buildDefaultCoachingState(),
        }),
    }),
    {
      name: 'readrail-local-state',
      version: 5,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as Record<string, unknown>
        // v1 → v2: seed defaultPageLayout for existing users
        if (fromVersion < 2) {
          const settings = state.settings as Record<string, unknown> | undefined
          const reader = settings?.reader as Record<string, unknown> | undefined
          if (reader && reader.defaultPageLayout === undefined) {
            reader.defaultPageLayout = 1
          }
        }
        // v2 → v3: seed quizAttempts
        if (fromVersion < 3) {
          state.quizAttempts = state.quizAttempts || []
        }
        // v3 → v4: seed persistent coaching state and reviewable quiz metadata defaults.
        if (fromVersion < 4) {
          const settings = state.settings as AppSettings | undefined
          const reader = settings?.reader
          const fallbackWpm = reader?.defaultWpm ?? defaultSettings.reader.defaultWpm
          state.coaching = state.coaching || buildDefaultCoachingState(fallbackWpm)

          const quizAttempts = (state.quizAttempts as QuizAttempt[] | undefined) ?? []
          state.quizAttempts = quizAttempts.map((attempt) => ({
            ...attempt,
            startWordIndex: attempt.startWordIndex ?? 0,
            endWordIndex: attempt.endWordIndex ?? attempt.wordCount,
            targetWpm: attempt.targetWpm ?? attempt.recommendedWpm ?? fallbackWpm,
          }))
        }
        // v4 → v5: seed structured document children while preserving document identity.
        if (fromVersion < 5) {
          const structured = ensureStructuredDocumentCollections({
            documents: state.documents as DocumentRecord[] | undefined,
            documentChapters: state.documentChapters as DocumentChapterRecord[] | undefined,
            documentPages: state.documentPages as DocumentPageRecord[] | undefined,
          })
          state.documents = structured.documents
          state.documentChapters = structured.documentChapters
          state.documentPages = structured.documentPages
        }
        return state
      },
      partialize: (state) => ({
        documents: state.documents,
        documentChapters: state.documentChapters,
        documentPages: state.documentPages,
        sessions: state.sessions,
        activeDocumentId: state.activeDocumentId,
        settings: state.settings,
        onboarding: state.onboarding,
        tourProgress: state.tourProgress,
        baselineResult: state.baselineResult,
        quizAttempts: state.quizAttempts,
        coaching: state.coaching,
      }),
    },
  ),
)

export function selectActiveDocument(state: AppState): DocumentRecord | null {
  return state.documents.find((document) => document.id === state.activeDocumentId) ?? null
}
