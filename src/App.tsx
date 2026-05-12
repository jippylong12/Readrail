import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppShell } from './components/AppShell'
import { CostsReport } from './components/CostsReport'
import { DocumentDetail } from './components/DocumentDetail'
import { ImportPanel } from './components/ImportPanel'
import { LibraryList } from './components/LibraryList'
import { OnboardingJourney } from './components/OnboardingJourney'
import { OcrReview } from './components/OcrReview'
import { PageDetail } from './components/PageDetail'
import { ReaderRail } from './components/ReaderRail'
import { ReadingQuizPanel } from './components/ReadingQuizPanel'
import { ProgressPanel, type ManualRetestInput } from './components/ProgressPanel'
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
import { buildReaderScope, normalizeReaderScopeSelection, type ReaderScopeSelection, type ReaderSessionScopeMetadata } from './app/readerScopes'
import { getRouteForShortcutEvent } from './app/shortcuts'
import { selectActiveDocument, useAppStore, type OcrPageInput } from './app/store'
import { TOUR_DEFINITIONS, type TourId } from './app/tours'
import { exportProgressCsv, exportProgressJson } from './lib/db/export'
import { getDatabase, isTauriRuntime } from './lib/db/migrations'
import { saveQuizAttemptToDatabase } from './lib/db/repository'
import { generateQuizFromReading, type GeminiQuiz } from './lib/ai/geminiQuiz'
import { buildGeneratedQuizAttempt, buildManualQuizAttempt, buildRetestQuizAttempt, scoreGeneratedQuizQuestions } from './lib/reading/coaching'
import type { DocumentRecord, ReaderMode, ReaderResumeMemory, ReaderResumeSlot } from './types/domain'

type PendingSession = {
  mode: ReaderMode
  targetWpm: number
  startWordIndex: number
  endWordIndex: number
  scopeStartWordIndex: number
  scopeEndWordIndex: number
  wordsRead: number
  durationSeconds: number
  pauseCount: number
  regressionCount: number
  scope: ReaderSessionScopeMetadata
  segmentContent: string
  segmentContentStartWordIndex: number
}

type PendingQuiz = {
  document: DocumentRecord
  error: string | null
  isLoading: boolean
  quiz: GeminiQuiz | null
  session: PendingSession
}

function App() {
  const [navigation, setNavigation] = useState<RouteState>(() => routeFromPath(currentBrowserPath()))
  const [pendingQuiz, setPendingQuiz] = useState<PendingQuiz | null>(null)
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [browserGeminiKey, setBrowserGeminiKey] = useState('')
  const [replayTourId, setReplayTourId] = useState<TourId | null>(null)
  const documents = useAppStore((state) => state.documents)
  const documentChapters = useAppStore((state) => state.documentChapters)
  const documentPages = useAppStore((state) => state.documentPages)
  const ocrJobs = useAppStore((state) => state.ocrJobs)
  const aiUsageLineItems = useAppStore((state) => state.aiUsageLineItems)
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
  const deletePage = useAppStore((state) => state.deletePage)
  const deletePages = useAppStore((state) => state.deletePages)
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
  const updateReaderResume = useAppStore((state) => state.updateReaderResume)
  const skipOnboarding = useAppStore((state) => state.skipOnboarding)
  const completeOnboardingIntro = useAppStore((state) => state.completeOnboardingIntro)
  const reopenOnboarding = useAppStore((state) => state.reopenOnboarding)
  const completeTour = useAppStore((state) => state.completeTour)
  const resetTour = useAppStore((state) => state.resetTour)
  const resetAllTours = useAppStore((state) => state.resetAllTours)
  const resetAllData = useAppStore((state) => state.resetAllData)
  const recoverDurableStateFromDatabase = useAppStore((state) => state.recoverDurableStateFromDatabase)
  const createAiUsageLineItem = useAppStore((state) => state.createAiUsageLineItem)
  const route = navigation.route
  const routedDocument = navigation.documentId
    ? documents.find((document) => document.id === navigation.documentId) ?? null
    : null
  const displayedDocument = routedDocument ?? activeDocument
  const routeReaderScopeSelection = useMemo(() => readerScopeSelectionFromRoute(navigation), [navigation])
  const readerResume = useMemo(
    () =>
      displayedDocument
        ? resolveReaderResume({
            document: displayedDocument,
            chapters: documentChapters,
            pages: documentPages,
            routeState: navigation,
            memory: coaching.readerResumeByDocument[displayedDocument.id],
            fallbackChunkSize: settings.reader.chunkSize,
          })
        : null,
    [coaching.readerResumeByDocument, displayedDocument, documentChapters, documentPages, navigation, settings.reader.chunkSize],
  )
  const readerScopeSelection = readerResume?.selection ?? routeReaderScopeSelection

  useEffect(() => {
    document.documentElement.dataset.theme = settings.reader.theme
  }, [settings.reader.theme])

  useEffect(() => {
    void getDatabase().then((database) => {
      if (!database) {
        return
      }
      void recoverDurableStateFromDatabase().then((recovered) => {
        if (recovered) {
          return
        }
        for (const attempt of useAppStore.getState().quizAttempts) {
          void saveQuizAttemptToDatabase(attempt)
        }
      })
    })
  }, [recoverDurableStateFromDatabase])

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
    const normalizedPath = pathForRoute(routeFromPath(currentBrowserPath()))
    if (currentBrowserPath() !== normalizedPath) {
      window.history.replaceState(null, '', normalizedPath)
    }

    function handlePopState(): void {
      setNavigation(routeFromPath(currentBrowserPath()))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextRoute: RouteState, options: { replace?: boolean } = {}): void => {
    setReplayTourId(null)
    setNavigation(nextRoute)
    const nextPath = pathForRoute(nextRoute)
    if (currentBrowserPath() === nextPath) {
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
    (input: {
      title: string
      chapterTitle: string
      pageTitle: string
      sourcePageNumber: number | null
      content: string
    }) => {
      const document = createDocument({
        title: input.title,
        content: input.content,
        sourceType: 'manual',
        chapterTitle: input.chapterTitle,
        pageTitle: input.pageTitle,
        sourcePageNumber: input.sourcePageNumber,
      })
      setActiveDocument(document.id)
      navigate({ route: 'library-document', documentId: document.id })
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
      navigate(
        chapterId
          ? { route: 'library-document', documentId: document.id, chapterId }
          : { route: 'library-document', documentId: document.id },
      )
    },
    [appendOcrPagesToDocument, navigate, setActiveDocument],
  )

  function exportFile(kind: 'json' | 'csv'): void {
    const exportInput = { documents, sessions, quizAttempts, documentChapters, documentPages }
    const contents = kind === 'json' ? exportProgressJson(exportInput) : exportProgressCsv(exportInput)
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
      const segmentContentStartWordIndex = Math.max(0, Math.round(session.segmentContentStartWordIndex))
      const segmentContentWordCount = session.segmentContent.split(/\s+/).filter(Boolean).length
      const segmentContentEndWordIndex = segmentContentStartWordIndex + segmentContentWordCount
      const requestedScopeEndWordIndex = session.scopeEndWordIndex || segmentContentEndWordIndex
      const scopeEndWordIndex = Math.max(
        segmentContentStartWordIndex,
        Math.min(requestedScopeEndWordIndex, segmentContentEndWordIndex),
      )
      const scopeStartWordIndex = Math.max(
        segmentContentStartWordIndex,
        Math.min(session.scopeStartWordIndex, scopeEndWordIndex),
      )
      const wordsRead = Math.max(1, scopeEndWordIndex - scopeStartWordIndex)
      const normalizedSession = {
        ...session,
        startWordIndex,
        endWordIndex,
        scopeStartWordIndex,
        scopeEndWordIndex,
        segmentContentStartWordIndex,
        wordsRead,
      }
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

        const quizText = excerptWords(
          normalizedSession.segmentContent,
          scopeStartWordIndex - segmentContentStartWordIndex,
          scopeEndWordIndex - segmentContentStartWordIndex,
        )
        const quizTitle =
          normalizedSession.scope.scopeType === 'document'
            ? quizDocument.title
            : `${quizDocument.title} - ${normalizedSession.scope.scopeLabel}`
        const quiz = await generateQuizFromReading(apiKey, quizTitle, quizText, wordsRead, {
          usageAttribution: {
            documentId: quizDocument.id,
          },
          recordUsage: (lineItem) => {
            createAiUsageLineItem(lineItem)
          },
        })
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
    [createAiUsageLineItem, displayedDocument, loadGeminiApiKey, navigate],
  )

  function cancelPendingQuiz(): void {
    setPendingQuiz(null)
    if (pendingQuiz) {
      navigate(routeForReaderScope(pendingQuiz.document.id, {
        scopeType: pendingQuiz.session.scope.scopeType,
        chapterId: pendingQuiz.session.scope.chapterId,
        startPageNumber: pendingQuiz.session.scope.pageNumbers[0] ?? null,
        endPageNumber: pendingQuiz.session.scope.pageNumbers[pendingQuiz.session.scope.pageNumbers.length - 1] ?? null,
      }))
      return
    }
    navigate({ route: 'reader', documentId: displayedDocument?.id ?? null })
  }

  function saveQuizResult(answers: Record<string, string>): void {
    if (!pendingQuiz?.quiz) {
      return
    }

    const scoring = scoreGeneratedQuizQuestions(pendingQuiz.quiz.questions, answers)
    const session = completeSession({
      ...pendingQuiz.session,
      documentId: pendingQuiz.document.id,
      scope: pendingQuiz.session.scope,
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
        scopeType: pendingQuiz.session.scope.scopeType,
        scopeLabel: pendingQuiz.session.scope.scopeLabel,
        chapterId: pendingQuiz.session.scope.chapterId,
        chapterTitle: pendingQuiz.session.scope.chapterTitle,
        pageIds: pendingQuiz.session.scope.pageIds,
        pageNumbers: pendingQuiz.session.scope.pageNumbers,
        sourcePageNumbers: pendingQuiz.session.scope.sourcePageNumbers,
        recentAttempts: quizAttempts,
        questionResults: scoring.questionResults,
        questions: scoring.questions,
      }),
    )
    setPendingQuiz(null)
    navigate({ route: 'progress', documentId: null })
  }

  function saveManualQuizResult(comprehensionPercent: number): void {
    if (!pendingQuiz) {
      return
    }

    const session = completeSession({
      ...pendingQuiz.session,
      documentId: pendingQuiz.document.id,
      scope: pendingQuiz.session.scope,
      startPosition: pendingQuiz.session.startWordIndex,
      endPosition: pendingQuiz.session.endWordIndex,
      comprehensionScore: comprehensionPercent,
      selfRating: null,
      notes: '',
    })
    addQuizAttempt(
      buildManualQuizAttempt({
        documentId: pendingQuiz.document.id,
        readingSessionId: session.id,
        startWordIndex: pendingQuiz.session.startWordIndex,
        endWordIndex: pendingQuiz.session.endWordIndex,
        wordCount: pendingQuiz.session.wordsRead,
        durationSeconds: pendingQuiz.session.durationSeconds,
        comprehensionPercent,
        currentTargetWpm: pendingQuiz.session.targetWpm,
        scopeType: pendingQuiz.session.scope.scopeType,
        scopeLabel: pendingQuiz.session.scope.scopeLabel,
        chapterId: pendingQuiz.session.scope.chapterId,
        chapterTitle: pendingQuiz.session.scope.chapterTitle,
        pageIds: pendingQuiz.session.scope.pageIds,
        pageNumbers: pendingQuiz.session.scope.pageNumbers,
        sourcePageNumbers: pendingQuiz.session.scope.sourcePageNumbers,
        recentAttempts: quizAttempts,
      }),
    )
    setPendingQuiz(null)
    navigate({ route: 'progress', documentId: null })
  }

  function saveManualRetest(input: ManualRetestInput): void {
    const document = documents.find((candidate) => candidate.id === input.documentId)
    if (!document) {
      return
    }

    addQuizAttempt(
      buildRetestQuizAttempt({
        documentId: document.id,
        startWordIndex: 0,
        endWordIndex: input.wordCount,
        wordCount: input.wordCount,
        durationSeconds: input.durationSeconds,
        comprehensionPercent: input.comprehensionPercent,
        currentTargetWpm: input.targetWpm,
        scopeType: 'document',
        scopeLabel: null,
        chapterId: null,
        chapterTitle: null,
        pageIds: [],
        pageNumbers: [],
        sourcePageNumbers: [],
        recentAttempts: quizAttempts,
      }),
    )
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
                ['library-import', 'Manual'],
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
              onCreateDocument={createAndOpenDocument}
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
              onOpenJobCosts={(ocrJobId) => {
                navigate({ route: 'costs', documentId: null, ocrJobId })
              }}
              preservePageBreaks={settings.ocr.preservePageBreaks}
              stripImageMetadataBeforeOcr={settings.privacy.stripImageMetadataBeforeOcr}
            />
          )}

          {route === 'library-saved' && (
            <LibraryList
              activeDocumentId={displayedDocument?.id ?? null}
              documentChapters={documentChapters}
              documentPages={documentPages}
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
          onOpenCosts={(documentId) => {
            navigate({ route: 'costs', documentId })
          }}
          onOpenJobCosts={(ocrJobId) => {
            navigate({ route: 'costs', documentId: null, ocrJobId })
          }}
          onDocumentViewChange={(documentId, chapterId, pageNumber, options) => {
            navigate({ route: 'library-document', documentId, chapterId, pageNumber }, options)
          }}
          onOpenPageDetail={(documentId, pageId) => {
            navigate({ route: 'library-page', documentId, pageId })
          }}
          onCreateChapter={(documentId, title) => {
            createChapter(documentId, title)
          }}
          onCreateDocument={createAndOpenOcrDocument}
          onDeleteChapter={(chapterId) => {
            deleteChapter(chapterId)
          }}
          onDeletePage={(pageId) => {
            deletePage(pageId)
          }}
          onDeletePages={deletePages}
          onMoveChapter={moveChapter}
          onMovePage={movePage}
          onOpenReader={(documentId, chapterId) => {
            setActiveDocument(documentId)
            navigate(chapterId ? { route: 'reader', documentId, chapterId } : { route: 'reader', documentId })
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

      {route === 'library-page' && (
        <PageDetail
          chapters={documentChapters}
          document={routedDocument}
          key={navigation.pageId ?? 'missing-page'}
          onBackToDocument={(documentId, chapterId) => {
            navigate(chapterId ? { route: 'library-document', documentId, chapterId } : { route: 'library-document', documentId })
          }}
          onDeletePage={(pageId) => {
            deletePage(pageId)
          }}
          onOpenPage={(documentId, pageId) => {
            navigate({ route: 'library-page', documentId, pageId })
          }}
          onOpenReader={(documentId, chapterId) => {
            setActiveDocument(documentId)
            navigate(chapterId ? { route: 'reader', documentId, chapterId } : { route: 'reader', documentId })
          }}
          onUpdatePageMetadata={updatePageMetadata}
          pageId={navigation.pageId ?? null}
          pages={documentPages}
        />
      )}

      {route === 'reader' && (
        <div className="content-stack">
          <ReaderRail
            baselineResult={baselineResult}
            chapters={documentChapters}
            defaultChunkSize={readerResume?.chunkSize ?? settings.reader.chunkSize}
            defaultMode={readerResume?.mode ?? settings.reader.defaultMode}
            defaultPageLayout={readerResume?.pageLayout ?? settings.reader.defaultPageLayout ?? 1}
            defaultWpm={readerResume?.targetWpm ?? (coaching.recommendedWpm || settings.reader.defaultWpm)}
            document={displayedDocument}
            fontSize={settings.reader.fontSize}
            key={displayedDocument ? pathForRoute(navigation) : 'empty-reader'}
            lineHeight={settings.reader.lineHeight}
            pages={documentPages}
            resumeMemory={displayedDocument ? coaching.readerResumeByDocument[displayedDocument.id] : undefined}
            scopeSelection={readerScopeSelection}
            initialCursorWordIndex={
              displayedDocument ? readerResume?.cursorWordIndex ?? coaching.lastResetWordIndexByDocument[displayedDocument.id] ?? 0 : 0
            }
            initialElapsedSeconds={readerResume?.elapsedSeconds ?? 0}
            initialPauseCount={readerResume?.pauseCount ?? 0}
            initialReadThroughWordIndex={
              displayedDocument ? readerResume?.readThroughWordIndex ?? readerResume?.wordIndex ?? coaching.lastResetWordIndexByDocument[displayedDocument.id] ?? 0 : 0
            }
            initialRegressionCount={readerResume?.regressionCount ?? 0}
            initialSegmentStartElapsedSeconds={readerResume?.segmentStartElapsedSeconds ?? 0}
            segmentStartWordIndex={
              displayedDocument ? readerResume?.segmentStartWordIndex ?? coaching.lastResetWordIndexByDocument[displayedDocument.id] ?? 0 : 0
            }
            onBackToLibrary={() => navigate({ route: 'library-saved', documentId: null })}
            onSegmentReset={resetCoachingSegment}
            onSegmentStart={(documentId, segment) => startCoachingSegment(documentId, segment)}
            onResumeUpdate={updateReaderResume}
            onScopeChange={(selection) => {
              if (displayedDocument) {
                navigate(routeForReaderScope(displayedDocument.id, selection))
              }
            }}
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
              onManualSubmit={saveManualQuizResult}
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
          onSaveRetest={saveManualRetest}
          quizAttempts={quizAttempts}
          sessions={sessions}
        />
      )}

      {route === 'costs' && (
        <CostsReport
          documents={documents}
          initialFilters={{
            documentId: navigation.documentId ?? '',
            ocrJobId: navigation.ocrJobId ?? '',
          }}
          key={`costs:${navigation.documentId ?? ''}:${navigation.ocrJobId ?? ''}`}
          lineItems={aiUsageLineItems}
          ocrJobs={ocrJobs}
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

function currentBrowserPath(): string {
  return `${window.location.pathname}${window.location.search}`
}

function readerScopeSelectionFromRoute(routeState: RouteState): ReaderScopeSelection {
  if (routeState.route !== 'reader' || routeState.readerScopeType === 'document' || !routeState.chapterId) {
    return { scopeType: 'document' }
  }

  if (routeState.startPageNumber) {
    return {
      scopeType: 'pages',
      chapterId: routeState.chapterId,
      startPageNumber: routeState.startPageNumber,
      endPageNumber: routeState.endPageNumber ?? routeState.startPageNumber,
    }
  }

  return {
    scopeType: 'chapter',
    chapterId: routeState.chapterId,
  }
}

function routeForReaderScope(documentId: string, selection: ReaderScopeSelection): RouteState {
  if (selection.scopeType === 'document' || !selection.chapterId) {
    return { route: 'reader', documentId, readerScopeType: 'document' }
  }

  if (selection.scopeType === 'chapter') {
    return { route: 'reader', documentId, chapterId: selection.chapterId, readerScopeType: 'chapter' }
  }

  return {
    route: 'reader',
    documentId,
    chapterId: selection.chapterId,
    readerScopeType: 'pages',
    startPageNumber: selection.startPageNumber ?? null,
    endPageNumber: selection.endPageNumber ?? selection.startPageNumber ?? null,
  }
}

type ResolvedReaderResume = {
  selection: ReaderScopeSelection
  wordIndex: number
  cursorWordIndex: number
  readThroughWordIndex: number
  segmentStartWordIndex: number
  elapsedSeconds: number
  segmentStartElapsedSeconds: number
  pauseCount: number
  regressionCount: number
  chunkSize: number
  mode?: ReaderMode
  pageLayout?: ReaderResumeSlot['pageLayout']
  targetWpm?: number
}

function resolveReaderResume({
  document,
  chapters,
  pages,
  routeState,
  memory,
  fallbackChunkSize,
}: {
  document: DocumentRecord
  chapters: Parameters<typeof buildReaderScope>[1]
  pages: Parameters<typeof buildReaderScope>[2]
  routeState: RouteState
  memory: ReaderResumeMemory | undefined
  fallbackChunkSize: number
}): ResolvedReaderResume | null {
  if (routeState.route !== 'reader') {
    return null
  }

  const routeSelection = normalizeReaderScopeSelection(document, chapters, pages, readerScopeSelectionFromRoute(routeState))
  const isExplicitScopeRoute = Boolean(routeState.readerScopeType || routeState.chapterId)
  if (isExplicitScopeRoute) {
    const matchingSlot = getReaderResumeSlotForSelection(memory, routeSelection)
    const scope = buildReaderScope(document, chapters, pages, routeSelection)
    return buildResolvedReaderResume(routeSelection, scope, matchingSlot, fallbackChunkSize)
  }

  const slot = getLatestReaderResumeSlot(memory)
  if (!slot) {
    return null
  }

  const selection = normalizeReaderScopeSelection(document, chapters, pages, readerResumeSlotToSelection(slot))
  const scope = buildReaderScope(document, chapters, pages, selection)
  return buildResolvedReaderResume(selection, scope, slot, fallbackChunkSize)
}

function buildResolvedReaderResume(
  selection: ReaderScopeSelection,
  scope: ReturnType<typeof buildReaderScope>,
  slot: ReaderResumeSlot | null,
  fallbackChunkSize: number,
): ResolvedReaderResume {
  const fallbackWordIndex = scope.startWordOffset
  return {
    selection,
    wordIndex: clampResumeWordIndex(slot?.wordIndex ?? slot?.readThroughWordIndex ?? fallbackWordIndex, scope),
    cursorWordIndex: clampResumeWordIndex(slot?.cursorWordIndex ?? slot?.wordIndex ?? fallbackWordIndex, scope),
    readThroughWordIndex: clampResumeWordIndex(slot?.readThroughWordIndex ?? slot?.wordIndex ?? fallbackWordIndex, scope),
    segmentStartWordIndex: clampResumeWordIndex(slot?.segmentStartWordIndex ?? slot?.cursorWordIndex ?? fallbackWordIndex, scope),
    elapsedSeconds: Math.max(0, Math.round(slot?.elapsedSeconds ?? 0)),
    segmentStartElapsedSeconds: Math.max(0, Math.round(slot?.segmentStartElapsedSeconds ?? 0)),
    pauseCount: Math.max(0, Math.round(slot?.pauseCount ?? 0)),
    regressionCount: Math.max(0, Math.round(slot?.regressionCount ?? 0)),
    chunkSize: slot?.chunkSize || fallbackChunkSize,
    mode: slot?.mode,
    pageLayout: slot?.pageLayout,
    targetWpm: slot?.targetWpm,
  }
}

function getLatestReaderResumeSlot(memory: ReaderResumeMemory | undefined): ReaderResumeSlot | null {
  const slots = [
    memory?.document ?? null,
    ...Object.values(memory?.chapters ?? {}),
    ...Object.values(memory?.pageRanges ?? {}),
  ]
    .filter((slot): slot is ReaderResumeSlot => Boolean(slot))
  if (slots.length === 0) {
    return null
  }

  return slots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function getReaderResumeSlotForSelection(
  memory: ReaderResumeMemory | undefined,
  selection: ReaderScopeSelection,
): ReaderResumeSlot | null {
  const slot =
    selection.scopeType === 'document'
      ? memory?.document
      : selection.scopeType === 'chapter'
        ? memory?.chapters?.[selection.chapterId ?? '']
        : memory?.pageRanges?.[getReaderResumePageRangeKey(selection)]
  return slot && readerResumeSlotMatchesSelection(slot, selection) ? slot : null
}

function readerResumeSlotMatchesSelection(slot: ReaderResumeSlot, selection: ReaderScopeSelection): boolean {
  if (slot.scopeType !== selection.scopeType) {
    return false
  }
  if (selection.scopeType === 'document') {
    return true
  }
  if (slot.chapterId !== selection.chapterId) {
    return false
  }
  if (selection.scopeType === 'chapter') {
    return true
  }
  return slot.startPageNumber === selection.startPageNumber && slot.endPageNumber === selection.endPageNumber
}

function getReaderResumePageRangeKey(selection: Pick<ReaderScopeSelection, 'chapterId' | 'endPageNumber' | 'startPageNumber'>): string {
  return `${selection.chapterId ?? 'unknown'}:${selection.startPageNumber ?? 'start'}-${selection.endPageNumber ?? selection.startPageNumber ?? 'end'}`
}

function readerResumeSlotToSelection(slot: ReaderResumeSlot): ReaderScopeSelection {
  if (slot.scopeType === 'document') {
    return { scopeType: 'document' }
  }
  if (slot.scopeType === 'chapter') {
    return { scopeType: 'chapter', chapterId: slot.chapterId }
  }
  return {
    scopeType: 'pages',
    chapterId: slot.chapterId,
    startPageNumber: slot.startPageNumber,
    endPageNumber: slot.endPageNumber ?? slot.startPageNumber,
  }
}

function clampResumeWordIndex(wordIndex: number, scope: ReturnType<typeof buildReaderScope>): number {
  return Math.max(scope.startWordOffset, Math.min(scope.endWordOffset, Math.round(wordIndex)))
}

function excerptWords(content: string, startWordIndex: number, endWordIndex: number): string {
  return content.split(/\s+/).filter(Boolean).slice(startWordIndex, endWordIndex).join(' ')
}

export default App
