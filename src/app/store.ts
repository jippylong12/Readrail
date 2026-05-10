import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  BaselineAssessmentResult,
  DocumentRecord,
  OnboardingState,
  ReaderMode,
  ReadingSession,
  SourceType,
} from '../types/domain'
import { calculateAdjustedWpm, calculateActualWpm } from '../lib/reading/pacing'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords, estimatePages } from '../lib/text/wordCount'
import { saveDocumentToDatabase, saveSessionToDatabase } from '../lib/db/repository'

type CreateDocumentInput = {
  title: string
  content: string
  sourceType: SourceType
}

type CompleteSessionInput = {
  documentId: string
  mode: ReaderMode
  targetWpm: number
  wordsRead: number
  durationSeconds: number
  pauseCount: number
  regressionCount: number
  comprehensionScore: number | null
  selfRating: number | null
  notes: string
}

type AppState = {
  documents: DocumentRecord[]
  sessions: ReadingSession[]
  activeDocumentId: string | null
  settings: AppSettings
  onboarding: OnboardingState
  baselineResult: BaselineAssessmentResult | null
  createDocument: (input: CreateDocumentInput) => DocumentRecord
  updateDocument: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
  archiveDocument: (id: string) => void
  setActiveDocument: (id: string | null) => void
  completeSession: (input: CompleteSessionInput) => ReadingSession
  updateSettings: (settings: Partial<AppSettings>) => void
  saveBaselineResult: (result: BaselineAssessmentResult) => void
  skipOnboarding: () => void
  completeOnboardingIntro: () => void
  reopenOnboarding: () => void
  resetAllData: () => void
}

const defaultSettings: AppSettings = {
  reader: {
    defaultWpm: 250,
    defaultMode: 'rail',
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
    modelId: 'gemini-2.5-flash-lite',
    preservePageBreaks: true,
  },
}

export const defaultOnboardingState: OnboardingState = {
  status: 'not_started',
  skippedAt: null,
  introCompletedAt: null,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      documents: [],
      sessions: [],
      activeDocumentId: null,
      settings: defaultSettings,
      onboarding: defaultOnboardingState,
      baselineResult: null,
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
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }

        set((state) => ({
          documents: [document, ...state.documents],
          activeDocumentId: document.id,
        }))
        void saveDocumentToDatabase(document)

        return document
      },
      updateDocument: (id, updates) => {
        const updatedAt = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null

        set((state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== id) {
              return document
            }

            const content = updates.content ? cleanReadingText(updates.content, { preservePageBreaks: true }) : document.content
            const wordCount = countWords(content)
            changedDocument = {
              ...document,
              ...updates,
              content,
              wordCount,
              estimatedPages: estimatePages(wordCount),
              updatedAt,
            }
            return changedDocument
          }),
        }))

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument)
        }
      },
      archiveDocument: (id) => {
        const updatedAt = new Date().toISOString()
        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === id ? { ...document, archivedAt: updatedAt, updatedAt } : document,
          ),
          activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
        }))
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
          startPosition: 0,
          endPosition: input.wordsRead,
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
      resetAllData: () =>
        set({
          documents: [],
          sessions: [],
          activeDocumentId: null,
          onboarding: defaultOnboardingState,
          baselineResult: null,
        }),
    }),
    {
      name: 'readrail-local-state',
      version: 1,
      partialize: (state) => ({
        documents: state.documents,
        sessions: state.sessions,
        activeDocumentId: state.activeDocumentId,
        settings: state.settings,
        onboarding: state.onboarding,
        baselineResult: state.baselineResult,
      }),
    },
  ),
)

export function selectActiveDocument(state: AppState): DocumentRecord | null {
  return state.documents.find((document) => document.id === state.activeDocumentId) ?? null
}
