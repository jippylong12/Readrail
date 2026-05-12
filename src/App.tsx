import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppShell } from './components/AppShell'
import { DocumentDetail } from './components/DocumentDetail'
import { ImportPanel } from './components/ImportPanel'
import { LibraryList } from './components/LibraryList'
import { OnboardingJourney } from './components/OnboardingJourney'
import { OcrReview } from './components/OcrReview'
import { ReaderRail } from './components/ReaderRail'
import { ReadingQuizPanel } from './components/ReadingQuizPanel'
import { ProgressPanel } from './components/ProgressPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsChart } from './components/StatsChart'
import { GuidedTour } from './components/GuidedTour'
import {
  DEFAULT_ROUTE,
  pathForRoute,
  primaryRouteFor,
  routeFromPath,
  type PrimaryRoute,
  type RouteState,
} from './app/routes'
import { getRouteForShortcutEvent } from './app/shortcuts'
import { selectActiveDocument, useAppStore, type OcrPageInput } from './app/store'
import { TOUR_DEFINITIONS, type TourId } from './app/tours'
import { exportProgressCsv, exportProgressJson } from './lib/db/export'
import { getDatabase, isTauriRuntime } from './lib/db/migrations'
import { generateQuizFromReading, type GeminiQuiz } from './lib/ai/geminiQuiz'
import { buildGeneratedQuizAttempt, scoreGeneratedQuizQuestions } from './lib/reading/coaching'
import type { DocumentRecord, ReaderMode } from './types/domain'

type PendingSession = {
  mode: ReaderMode
  targetWpm: number
  startWordIndex: number
  endWordIndex: number
  wordsRead: number
  durationSeconds: number
  pauseCount: number
  regressionCount: number
}

type PendingQuiz = {
  document: DocumentRecord
  error: string | null
  isLoading: boolean
  quiz: GeminiQuiz | null
  session: PendingSession
}

function App() {
  const [navigation, setNavigation] = useState<RouteState>(() => routeFromPath(window.location.pathname))
  const [pendingQuiz, setPendingQuiz] = useState<PendingQuiz | null>(null)
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [browserGeminiKey, setBrowserGeminiKey] = useState('')
  const [replayTourId, setReplayTourId] = useState<TourId | null>(null)
  const documents = useAppStore((state) => state.documents)
  const documentChapters = useAppStore((state) => state.documentChapters)
  const documentPages = useAppStore((state) => state.documentPages)
  const sessions = useAppStore((state) => state.sessions)
  const settings = useAppStore((state) => state.settings)
  const onboarding = useAppStore((state) => state.onboarding)
  const completedTourIds = useAppStore((state) => state.tourProgress.completedTourIds)
  const baselineResult = useAppStore((state) => state.baselineResult)
  const quizAttempts = useAppStore((state) => state.quizAttempts)
  const coaching = useAppStore((state) => state.coaching)
  const activeDocument = useAppStore(selectActiveDocument)
  const createDocument = useAppStore((state) => state.createDocument)
  const createOcrDocument = useAppStore((state) => state.createOcrDocument)
  const appendOcrPagesToDocument = useAppStore((state) => state.appendOcrPagesToDocument)
  const recoverInterruptedOcrJobs = useAppStore((state) => state.recoverInterruptedOcrJobs)
  const createChapter = useAppStore((state) => state.createChapter)
  const renameChapter = useAppStore((state) => state.renameChapter)
  const moveChapter = useAppStore((state) => state.moveChapter)
  const deleteChapter = useAppStore((state) => state.deleteChapter)
  const movePage = useAppStore((state) => state.movePage)
  const updatePageMetadata = useAppStore((state) => state.updatePageMetadata)
  const updateDocument = useAppStore((state) => state.updateDocument)
  const archiveDocument = useAppStore((state) => state.archiveDocument)
  const setActiveDocument = useAppStore((state) => state.setActiveDocument)
  const completeSession = useAppStore((state) => state.completeSession)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const saveBaselineResult = useAppStore((state) => state.saveBaselineResult)
  const addQuizAttempt = useAppStore((state) => state.addQuizAttempt)
  const resetCoachingSegment = useAppStore((state) => state.resetCoachingSegment)
  const startCoachingSegment = useAppStore((state) => state.startCoachingSegment)
  const skipOnboarding = useAppStore((state) => state.skipOnboarding)
  const completeOnboardingIntro = useAppStore((state) => state.completeOnboardingIntro)
  const reopenOnboarding = useAppStore((state) => state.reopenOnboarding)
  const completeTour = useAppStore((state) => state.completeTour)
  const resetTour = useAppStore((state) => state.resetTour)
  const resetAllTours = useAppStore((state) => state.resetAllTours)
  const resetAllData = useAppStore((state) => state.resetAllData)
  const route = navigation.route
  const routedDocument = navigation.documentId
    ? documents.find((document) => document.id === navigation.documentId) ?? null
    : null
  const displayedDocument = routedDocument ?? activeDocument

  useEffect(() => {
    document.documentElement.dataset.theme = settings.reader.theme
  }, [settings.reader.theme])

  useEffect(() => {
    void getDatabase()
  }, [])

  useEffect(() => {
    recoverInterruptedOcrJobs()
  }, [recoverInterruptedOcrJobs])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    void invoke<{ hasKey: boolean }>('keychain_has_gemini_key').then((result) => {
      setHasGeminiKey(result.hasKey)
    })
  }, [])

  useEffect(() => {
    const normalizedPath = pathForRoute(routeFromPath(window.location.pathname))
    if (window.location.pathname !== normalizedPath) {
      window.history.replaceState(null, '', normalizedPath)
    }

    function handlePopState(): void {
      setNavigation(routeFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextRoute: RouteState, options: { replace?: boolean } = {}): void => {
    setReplayTourId(null)
    setNavigation(nextRoute)
    const nextPath = pathForRoute(nextRoute)
    if (window.location.pathname === nextPath) {
      return
    }

    if (options.replace) {
      window.history.replaceState(null, '', nextPath)
    } else {
      window.history.pushState(null, '', nextPath)
    }
  }, [])

  useEffect(() => {
    if (navigation.documentId) {
      setActiveDocument(navigation.documentId)
    }
  }, [navigation.documentId, setActiveDocument])

  const routeTourId = primaryRouteFor(route) in TOUR_DEFINITIONS ? (primaryRouteFor(route) as TourId) : null
  const activeTourId = replayTourId ?? (routeTourId && !completedTourIds.includes(routeTourId) ? routeTourId : null)

  const createAndOpenDocument = useCallback(
    (title: string, content: string, sourceType: 'paste' | 'text_file' | 'photo_ocr' = 'paste') => {
      const document = createDocument({ title, content, sourceType })
      setActiveDocument(document.id)
      navigate({ route: 'reader', documentId: document.id })
    },
    [createDocument, navigate, setActiveDocument],
  )

  const createAndOpenOcrDocument = useCallback(
    (title: string, pages: OcrPageInput[]) => {
      const document = createOcrDocument({ title, pages })
      setActiveDocument(document.id)
      navigate({ route: 'library-document', documentId: document.id })
    },
    [createOcrDocument, navigate, setActiveDocument],
  )

  const appendAndOpenOcrPages = useCallback(
    (documentId: string, pages: OcrPageInput[], chapterId?: string | null) => {
      const document = appendOcrPagesToDocument(documentId, pages, chapterId)
      if (!document) {
        return
      }

      setActiveDocument(document.id)
      navigate({ route: 'library-document', documentId: document.id })
    },
    [appendOcrPagesToDocument, navigate, setActiveDocument],
  )

  function exportFile(kind: 'json' | 'csv'): void {
    const contents = kind === 'json' ? exportProgressJson(documents, sessions) : exportProgressCsv(sessions)
    const type = kind === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `readrail-progress.${kind}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function enterAppAfterSkip(): void {
    skipOnboarding()
    navigate(DEFAULT_ROUTE)
  }

  function enterAppAfterIntro(): void {
    completeOnboardingIntro()
    navigate(DEFAULT_ROUTE)
  }

  function replayTour(tourId: TourId = routeTourId ?? 'reader'): void {
    navigate({ route: tourId, documentId: tourId === 'reader' ? displayedDocument?.id ?? null : null })
    resetTour(tourId)
    setReplayTourId(tourId)
  }

  function finishTour(tourId: TourId): void {
    completeTour(tourId)
    setReplayTourId(null)
  }

  const changeRoute = useCallback(
    (nextRoute: PrimaryRoute): void => {
      navigate({
        route: nextRoute,
        documentId: nextRoute === 'reader' ? displayedDocument?.id ?? null : null,
      })
    },
    [displayedDocument?.id, navigate],
  )

  const handleGeminiKeyStateChange = useCallback((hasKey: boolean, apiKey?: string): void => {
    setHasGeminiKey(hasKey)
    if (apiKey !== undefined) {
      setBrowserGeminiKey(apiKey.trim())
    }
  }, [])

  const loadGeminiApiKey = useCallback(async (reason: 'ocr' | 'quiz'): Promise<string | null> => {
    if (!hasGeminiKey) {
      return null
    }

    if (isTauriRuntime()) {
      const key = await invoke<string>('keychain_get_gemini_key_for_ocr', { reason })
      return key.trim() || null
    }

    const sessionKey = browserGeminiKey.trim()
    if (sessionKey) {
      return sessionKey
    }

    return null
  }, [browserGeminiKey, hasGeminiKey])

  const startQuizForSession = useCallback(
    async (session: PendingSession): Promise<void> => {
      const currentDocument = displayedDocument
      if (!currentDocument) {
        return
      }

      const endWordIndex = Math.max(0, Math.min(session.endWordIndex || currentDocument.wordCount, currentDocument.wordCount))
      const startWordIndex = Math.max(0, Math.min(session.startWordIndex, endWordIndex))
      const wordsRead = Math.max(1, endWordIndex - startWordIndex)
      const normalizedSession = { ...session, startWordIndex, endWordIndex, wordsRead }
      const quizDocument = currentDocument
      navigate({ route: 'test', documentId: null })
      setPendingQuiz({
        document: quizDocument,
        error: null,
        isLoading: true,
        quiz: null,
        session: normalizedSession,
      })

      try {
        const apiKey = await loadGeminiApiKey('quiz')
        if (!apiKey) {
          throw new Error('Add a Gemini API key in Settings before testing comprehension.')
        }

        const quizText = excerptWords(quizDocument.content, startWordIndex, endWordIndex)
        const quiz = await generateQuizFromReading(apiKey, quizDocument.title, quizText, wordsRead)
        setPendingQuiz({
          document: quizDocument,
          error: null,
          isLoading: false,
          quiz,
          session: normalizedSession,
        })
      } catch (error) {
        setPendingQuiz({
          document: quizDocument,
          error: error instanceof Error ? error.message : 'Quiz generation failed.',
          isLoading: false,
          quiz: null,
          session: normalizedSession,
        })
      }
    },
    [displayedDocument, loadGeminiApiKey, navigate],
  )

  function cancelPendingQuiz(): void {
    setPendingQuiz(null)
    navigate({ route: 'reader', documentId: pendingQuiz?.document.id ?? displayedDocument?.id ?? null })
  }

  function saveQuizResult(answers: Record<string, string>): void {
    if (!pendingQuiz?.quiz) {
      return
    }

    const scoring = scoreGeneratedQuizQuestions(pendingQuiz.quiz.questions, answers)
    const session = completeSession({
      ...pendingQuiz.session,
      documentId: pendingQuiz.document.id,
      startPosition: pendingQuiz.session.startWordIndex,
      endPosition: pendingQuiz.session.endWordIndex,
      comprehensionScore: scoring.comprehensionPercent,
      selfRating: null,
      notes: '',
    })
    addQuizAttempt(
      buildGeneratedQuizAttempt({
        documentId: pendingQuiz.document.id,
        readingSessionId: session.id,
        startWordIndex: pendingQuiz.session.startWordIndex,
        endWordIndex: pendingQuiz.session.endWordIndex,
        wordCount: pendingQuiz.session.wordsRead,
        durationSeconds: pendingQuiz.session.durationSeconds,
        comprehensionPercent: scoring.comprehensionPercent,
        currentTargetWpm: pendingQuiz.session.targetWpm,
        questionResults: scoring.questionResults,
        questions: scoring.questions,
      }),
    )
    setPendingQuiz(null)
    navigate({ route: 'progress', documentId: null })
  }

  useEffect(() => {
    if (onboarding.status === 'not_started') {
      return undefined
    }

    function handleSectionShortcut(event: KeyboardEvent): void {
      const shortcutRoute = getRouteForShortcutEvent(event)

      if (!shortcutRoute) {
        return
      }

      event.preventDefault()
      changeRoute(shortcutRoute)
    }

    window.addEventListener('keydown', handleSectionShortcut)
    return () => window.removeEventListener('keydown', handleSectionShortcut)
  }, [changeRoute, onboarding.status])

  if (onboarding.status === 'not_started') {
    return (
      <OnboardingJourney
        baselineResult={baselineResult}
        onBaselineComplete={saveBaselineResult}
        onComplete={enterAppAfterIntro}
        onSkip={enterAppAfterSkip}
      />
    )
  }

  return (
    <AppShell
      activeDocument={displayedDocument}
      activeRoute={primaryRouteFor(route)}
      onReplayTour={() => replayTour()}
      onRouteChange={changeRoute}
    >
      {(route === 'library-import' || route === 'library-ocr' || route === 'library-saved') && (
        <div className="content-stack">
          <section className="library-tabs-panel" data-tour="library-tabs">
            <div className="segmented library-tabs" role="tablist" aria-label="Library sections">
              {([
                ['library-import', 'Import'],
                ['library-ocr', 'OCR'],
                ['library-saved', 'Saved'],
              ] as const).map(([tabId, label]) => (
                <button
                  aria-selected={route === tabId}
                  className={route === tabId ? 'active' : ''}
                  key={tabId}
                  onClick={() => navigate({ route: tabId, documentId: null })}
                  role="tab"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {route === 'library-import' && (
            <ImportPanel
              defaultWpm={settings.reader.defaultWpm}
              onCreateDocument={(title, content, sourceType) => createAndOpenDocument(title, content, sourceType)}
            />
          )}

          {route === 'library-ocr' && (
            <OcrReview
              documents={documents}
              documentChapters={documentChapters}
              hasKey={hasGeminiKey}
              loadApiKey={() => loadGeminiApiKey('ocr')}
              onAppendPages={appendAndOpenOcrPages}
              onCreateDocument={createAndOpenOcrDocument}
              preservePageBreaks={settings.ocr.preservePageBreaks}
              stripImageMetadataBeforeOcr={settings.privacy.stripImageMetadataBeforeOcr}
            />
          )}

          {route === 'library-saved' && (
            <LibraryList
              activeDocumentId={displayedDocument?.id ?? null}
              documents={documents}
              onArchive={archiveDocument}
              onOpenJourney={reopenOnboarding}
              onOpenDocument={(id) => {
                setActiveDocument(id)
                navigate({ route: 'library-document', documentId: id })
              }}
              onOpenReader={(id) => {
                setActiveDocument(id)
                navigate({ route: 'reader', documentId: id })
              }}
              onUpdateDocument={updateDocument}
            />
          )}
        </div>
      )}

      {route === 'library-document' && (
        <DocumentDetail
          chapters={documentChapters}
          document={routedDocument}
          documents={documents}
          hasKey={hasGeminiKey}
          loadApiKey={() => loadGeminiApiKey('ocr')}
          onAppendPages={appendAndOpenOcrPages}
          onBack={() => navigate({ route: 'library-saved', documentId: null })}
          onDocumentViewChange={(documentId, chapterId, pageNumber, options) => {
            navigate({ route: 'library-document', documentId, chapterId, pageNumber }, options)
          }}
          onCreateChapter={(documentId, title) => {
            createChapter(documentId, title)
          }}
          onCreateDocument={createAndOpenOcrDocument}
          onDeleteChapter={(chapterId) => {
            deleteChapter(chapterId)
          }}
          onMoveChapter={moveChapter}
          onMovePage={movePage}
          onOpenReader={(documentId) => {
            setActiveDocument(documentId)
            navigate({ route: 'reader', documentId })
          }}
          onRenameChapter={renameChapter}
          onUpdatePageMetadata={updatePageMetadata}
          pages={documentPages}
          preservePageBreaks={settings.ocr.preservePageBreaks}
          routeChapterId={navigation.chapterId ?? null}
          routePageNumber={navigation.pageNumber ?? null}
          stripImageMetadataBeforeOcr={settings.privacy.stripImageMetadataBeforeOcr}
        />
      )}

      {route === 'reader' && (
        <div className="content-stack">
          <ReaderRail
            baselineResult={baselineResult}
            defaultChunkSize={settings.reader.chunkSize}
            defaultMode={settings.reader.defaultMode}
            defaultPageLayout={settings.reader.defaultPageLayout ?? 1}
            defaultWpm={coaching.recommendedWpm || settings.reader.defaultWpm}
            document={displayedDocument}
            fontSize={settings.reader.fontSize}
            key={displayedDocument?.id ?? 'empty-reader'}
            lineHeight={settings.reader.lineHeight}
            segmentStartWordIndex={
              displayedDocument ? coaching.lastResetWordIndexByDocument[displayedDocument.id] ?? 0 : 0
            }
            onBackToLibrary={() => navigate({ route: 'library-saved', documentId: null })}
            onSegmentReset={resetCoachingSegment}
            onSegmentStart={(documentId, segment) => startCoachingSegment(documentId, segment)}
            onStartTest={(input) => {
              void startQuizForSession(input)
            }}
            onUpdateDocument={updateDocument}
          />
        </div>
      )}

      {route === 'test' && (
        <div className="content-stack">
          {pendingQuiz ? (
            <ReadingQuizPanel
              durationSeconds={pendingQuiz.session.durationSeconds}
              error={pendingQuiz.error}
              isLoading={pendingQuiz.isLoading}
              onCancel={cancelPendingQuiz}
              onRetry={() => {
                void startQuizForSession(pendingQuiz.session)
              }}
              onSubmit={saveQuizResult}
              quiz={pendingQuiz.quiz}
              wordsRead={pendingQuiz.session.wordsRead}
            />
          ) : (
            <section className="panel quiz-panel">
              <span className="eyebrow">Test</span>
              <h1>No test in progress</h1>
              <div className="empty-state">
                <strong>Return to the reader</strong>
                <span>Open a reading and use Test to generate a comprehension quiz.</span>
              </div>
              <button
                className="primary-button"
                onClick={() => navigate({ route: 'reader', documentId: displayedDocument?.id ?? null })}
                type="button"
              >
                Back to reader
              </button>
            </section>
          )}
        </div>
      )}

      {route === 'progress' && (
        <ProgressPanel
          coaching={coaching}
          documents={documents}
          onOpenReader={(documentId) => {
            setActiveDocument(documentId)
            navigate({ route: 'reader', documentId })
          }}
          quizAttempts={quizAttempts}
        />
      )}

      {route === 'stats' && (
        <div className="content-stack">
          <StatsChart
            baselineResult={baselineResult}
            documents={documents}
            sessions={sessions}
          />
          <section className="panel export-panel" data-tour="export">
            <span className="eyebrow">Export</span>
            <h2>Progress backup</h2>
            <div className="button-row">
              <button className="secondary-button" onClick={() => exportFile('csv')} type="button">
                Export CSV
              </button>
              <button className="secondary-button" onClick={() => exportFile('json')} type="button">
                Export JSON
              </button>
            </div>
          </section>
        </div>
      )}

      {route === 'settings' && (
        <SettingsPanel
          onKeyStateChange={handleGeminiKeyStateChange}
          onOpenJourney={reopenOnboarding}
          onReplayTour={replayTour}
          onResetData={resetAllData}
          onSettingsChange={updateSettings}
          onResetTours={resetAllTours}
          baselineResult={baselineResult}
          settings={settings}
        />
      )}
      {activeTourId && (
        <GuidedTour key={activeTourId} tour={TOUR_DEFINITIONS[activeTourId]} onComplete={() => finishTour(activeTourId)} />
      )}
    </AppShell>
  )
}

function excerptWords(content: string, startWordIndex: number, endWordIndex: number): string {
  return content.split(/\s+/).filter(Boolean).slice(startWordIndex, endWordIndex).join(' ')
}

export default App
