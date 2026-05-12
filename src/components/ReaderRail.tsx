import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chunkText, getChunkDurationMs, tokenizeReadableWords } from '../lib/text/chunking'
import type {
  BaselineAssessmentResult,
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  PageLayout,
  ReaderMode,
  ReaderResumeMemory,
  ReaderResumeSlot,
  ReaderResumeSlotInput,
} from '../types/domain'
import { clampWpm, formatDuration } from '../lib/reading/pacing'
import { cleanReadingText } from '../lib/text/cleanup'
import {
  buildVirtualReaderPaneLayout,
  type ReaderPaneMetrics,
  type VirtualReaderPane,
  type VirtualReaderPaneLayout,
} from '../lib/text/pages'
import { countWords, estimatePages, estimateReadingMinutes } from '../lib/text/wordCount'
import { ReaderControls } from './ReaderControls'
import {
  getReaderPageDisplayNumber,
  type ReaderScopeSelection,
  type ReaderSessionScopeMetadata,
} from '../app/readerScopes'
import { getOrderedChapterPages, getOrderedDocumentChapters } from '../app/structuredDocuments'
import { getComprehensionSuggestionThresholdWords } from '../lib/reading/comprehension'
import {
  buildReaderContentModel,
  type ReaderContentModel,
  type ReaderContentWindow,
} from '../app/readerContentWindow'

const DEFAULT_READER_SURFACE_SIZE = { width: 960, height: 420 }

export type ReaderSegmentInput = {
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

type ReaderRailProps = {
  baselineResult: BaselineAssessmentResult | null
  chapters: DocumentChapterRecord[]
  document: DocumentRecord | null
  pages: DocumentPageRecord[]
  resumeMemory?: ReaderResumeMemory
  scopeSelection: ReaderScopeSelection
  defaultMode: ReaderMode
  defaultWpm: number
  defaultChunkSize: number
  defaultPageLayout: PageLayout
  fontSize: number
  initialCursorWordIndex?: number
  initialElapsedSeconds?: number
  initialPauseCount?: number
  initialReadThroughWordIndex?: number
  initialRegressionCount?: number
  initialSegmentStartElapsedSeconds?: number
  lineHeight: number
  segmentStartWordIndex: number
  onBackToLibrary: () => void
  onSegmentReset: (documentId: string, wordIndex: number) => void
  onSegmentStart: (documentId: string, segment: { startWordIndex: number; startedAt: string; targetWpm: number }) => void
  onResumeUpdate: (documentId: string, slot: ReaderResumeSlotInput) => void
  onScopeChange: (selection: ReaderScopeSelection) => void
  onStartTest: (input: ReaderSegmentInput) => void
  onUpdateDocument?: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
}

export function ReaderRail({
  baselineResult,
  chapters,
  document,
  pages,
  resumeMemory,
  scopeSelection,
  defaultMode,
  defaultWpm,
  defaultChunkSize,
  defaultPageLayout,
  fontSize,
  initialCursorWordIndex,
  initialElapsedSeconds = 0,
  initialPauseCount = 0,
  initialReadThroughWordIndex,
  initialRegressionCount = 0,
  initialSegmentStartElapsedSeconds = 0,
  lineHeight,
  segmentStartWordIndex: initialSegmentStartWordIndex,
  onBackToLibrary,
  onSegmentReset,
  onSegmentStart,
  onResumeUpdate,
  onScopeChange,
  onStartTest,
  onUpdateDocument,
}: ReaderRailProps) {
  const [mode, setMode] = useState<ReaderMode>(defaultMode)
  const [targetWpm, setTargetWpm] = useState(defaultWpm)
  const [chunkSize, setChunkSize] = useState(defaultChunkSize)
  const [pageLayout, setPageLayout] = useState<PageLayout>(defaultPageLayout)
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, Math.round(initialElapsedSeconds)))
  const [pauseCount, setPauseCount] = useState(() => Math.max(0, Math.round(initialPauseCount)))
  const [regressionCount, setRegressionCount] = useState(() => Math.max(0, Math.round(initialRegressionCount)))
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [hasStartedReading, setHasStartedReading] = useState(false)
  const [segmentStartElapsedSeconds, setSegmentStartElapsedSeconds] = useState(0)
  const [suggestion, setSuggestion] = useState<'threshold' | null>(null)
  const [isEditingDocument, setIsEditingDocument] = useState(false)
  const [draftTitle, setDraftTitle] = useState(document?.title ?? '')
  const [draftText, setDraftText] = useState(document?.content ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const startedRef = useRef<number | null>(null)
  const readingSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [readerSurfaceSize, setReaderSurfaceSize] = useState(DEFAULT_READER_SURFACE_SIZE)
  const [manualVisiblePaneStartIndex, setManualVisiblePaneStartIndex] = useState<number | null>(null)

  const activeScope = useMemo(
    () => (document ? buildReaderContentModel(document, chapters, pages, scopeSelection) : null),
    [chapters, document, pages, scopeSelection],
  )
  const initialCursorDocumentWordIndex = initialCursorWordIndex ?? initialSegmentStartWordIndex
  const initialReadThroughDocumentWordIndex = initialReadThroughWordIndex ?? initialCursorDocumentWordIndex
  const [segmentStartWordIndex, setSegmentStartWordIndex] = useState(() =>
    getLocalSegmentStart(initialSegmentStartWordIndex, activeScope),
  )
  const [cursorWordIndex, setCursorWordIndex] = useState(() =>
    getLocalSegmentStart(initialCursorDocumentWordIndex, activeScope),
  )
  const [readThroughWordIndex, setReadThroughWordIndex] = useState(() =>
    getLocalSegmentStart(initialReadThroughDocumentWordIndex, activeScope),
  )
  const [activeWindowStartWordIndex, setActiveWindowStartWordIndex] = useState(() =>
    getWindowStartForWord(activeScope, getLocalSegmentStart(initialCursorDocumentWordIndex, activeScope)),
  )
  const activeWindow = useMemo(
    () => activeScope?.getWindow(activeWindowStartWordIndex) ?? null,
    [activeScope, activeWindowStartWordIndex],
  )
  const chunks = useMemo(
    () => (activeWindow ? chunkWindowContent(activeWindow, chunkSize) : []),
    [activeWindow, chunkSize],
  )
  const activeIndex = getChunkIndexForWord(chunks, cursorWordIndex)
  const activeChunk = chunks[activeIndex]
  const currentWordIndex = Math.max(
    Math.min(readThroughWordIndex, activeScope?.wordCount ?? 0),
    activeChunk?.endWord ?? Math.min(cursorWordIndex, activeScope?.wordCount ?? 0),
  )
  const untestedWordCount = Math.max(0, currentWordIndex - segmentStartWordIndex)
  const comprehensionSuggestionThresholdWords = getComprehensionSuggestionThresholdWords(targetWpm)
  const progress = activeScope?.wordCount
    ? Math.round((Math.min(currentWordIndex, activeScope.wordCount) / activeScope.wordCount) * 100)
    : 0
  const cleanedDraftText = useMemo(
    () => cleanReadingText(draftText, { preservePageBreaks: true }),
    [draftText],
  )
  const draftWordCount = countWords(cleanedDraftText)
  const paneMetrics = useMemo<ReaderPaneMetrics>(
    () => ({
      containerHeight: readerSurfaceSize.height,
      containerWidth: readerSurfaceSize.width,
      fontSize,
      lineHeight,
      requestedPaneCount: pageLayout,
    }),
    [fontSize, lineHeight, pageLayout, readerSurfaceSize.height, readerSurfaceSize.width],
  )
  const paneLayout = useMemo(
    () => buildVirtualReaderPaneLayout(chunks, activeIndex, paneMetrics),
    [activeIndex, chunks, paneMetrics],
  )
  const visiblePaneStartIndex = Math.max(
    0,
    Math.min(manualVisiblePaneStartIndex ?? paneLayout.visibleStartPaneIndex, Math.max(0, paneLayout.panes.length - paneLayout.effectivePaneCount)),
  )
  const displayPaneLayout = useMemo<VirtualReaderPaneLayout<Chunk>>(
    () => ({
      ...paneLayout,
      visiblePanes: paneLayout.panes.slice(visiblePaneStartIndex, visiblePaneStartIndex + paneLayout.effectivePaneCount),
      visibleStartPaneIndex: visiblePaneStartIndex,
    }),
    [paneLayout, visiblePaneStartIndex],
  )
  const canGoPreviousPane = Boolean(
    !isRunning && activeScope && activeWindow && visiblePaneStartIndex > 0,
  )
  const canGoNextPane = Boolean(
    !isRunning
      && activeScope
      && activeWindow
      && visiblePaneStartIndex + paneLayout.effectivePaneCount < paneLayout.panes.length,
  )

  const scopeRuntimeStart = useMemo(() => {
    const localSegmentStart = getLocalSegmentStart(initialSegmentStartWordIndex, activeScope)
    const localCursor = getLocalSegmentStart(initialCursorDocumentWordIndex, activeScope)
    const localReadThrough = Math.max(localCursor, getLocalSegmentStart(initialReadThroughDocumentWordIndex, activeScope))
    return {
      elapsedSeconds: Math.max(0, Math.round(initialElapsedSeconds)),
      localSegmentStart,
      localCursor,
      localReadThrough,
      pauseCount: Math.max(0, Math.round(initialPauseCount)),
      regressionCount: Math.max(0, Math.round(initialRegressionCount)),
      segmentStartElapsedSeconds: Math.max(0, Math.round(initialSegmentStartElapsedSeconds)),
      windowStartWordIndex: getWindowStartForWord(activeScope, localCursor),
    }
    // Reset only when the selected scope boundaries change; App-level derived arrays can rebuild the model object during reader events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScope?.endWordOffset,
    activeScope?.scopeType,
    activeScope?.selectedChapterId,
    activeScope?.selectedEndPageNumber,
    activeScope?.selectedStartPageNumber,
    activeScope?.startWordOffset,
    activeScope?.wordCount,
  ])

  const rememberResume = useCallback((updates: Partial<{
    chunkSize: number
    cursorWordIndex: number
    elapsedSeconds: number
    mode: ReaderMode
    pageLayout: PageLayout
    pauseCount: number
    readThroughWordIndex: number
    regressionCount: number
    segmentStartElapsedSeconds: number
    segmentStartWordIndex: number
    targetWpm: number
  }> = {}): void => {
    if (!document || !activeScope) {
      return
    }

    const normalizedCursor = Math.max(0, Math.min(activeScope.wordCount, Math.round(updates.cursorWordIndex ?? cursorWordIndex)))
    const normalizedReadThrough = Math.max(
      normalizedCursor,
      Math.min(activeScope.wordCount, Math.round(updates.readThroughWordIndex ?? currentWordIndex)),
    )
    const normalizedSegmentStart = Math.max(
      0,
      Math.min(activeScope.wordCount, Math.round(updates.segmentStartWordIndex ?? segmentStartWordIndex)),
    )
    const absoluteCursor = activeScope.startWordOffset + normalizedCursor
    const absoluteReadThrough = activeScope.startWordOffset + normalizedReadThrough
    const absoluteSegmentStart = activeScope.startWordOffset + normalizedSegmentStart

    onResumeUpdate(document.id, {
      scopeType: activeScope.scopeType,
      chapterId: activeScope.scopeType === 'document' ? null : activeScope.selectedChapterId,
      startPageNumber: activeScope.scopeType === 'pages' ? activeScope.selectedStartPageNumber : null,
      endPageNumber: activeScope.scopeType === 'pages' ? activeScope.selectedEndPageNumber : null,
      cursorWordIndex: absoluteCursor,
      readThroughWordIndex: absoluteReadThrough,
      segmentStartWordIndex: absoluteSegmentStart,
      elapsedSeconds: Math.max(0, Math.round(updates.elapsedSeconds ?? elapsedSeconds)),
      segmentStartElapsedSeconds: Math.max(0, Math.round(updates.segmentStartElapsedSeconds ?? segmentStartElapsedSeconds)),
      pauseCount: Math.max(0, Math.round(updates.pauseCount ?? pauseCount)),
      regressionCount: Math.max(0, Math.round(updates.regressionCount ?? regressionCount)),
      wordIndex: absoluteReadThrough,
      chunkSize: updates.chunkSize ?? chunkSize,
      mode: updates.mode ?? mode,
      pageLayout: updates.pageLayout ?? pageLayout,
      targetWpm: updates.targetWpm ?? targetWpm,
    })
  }, [
    activeScope,
    chunkSize,
    currentWordIndex,
    cursorWordIndex,
    document,
    elapsedSeconds,
    mode,
    onResumeUpdate,
    pageLayout,
    pauseCount,
    regressionCount,
    segmentStartElapsedSeconds,
    segmentStartWordIndex,
    targetWpm,
  ])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCursorWordIndex(scopeRuntimeStart.localCursor)
    setReadThroughWordIndex(scopeRuntimeStart.localReadThrough)
    setActiveWindowStartWordIndex(scopeRuntimeStart.windowStartWordIndex)
    setIsRunning(false)
    setIsFocusMode(false)
    setHasStartedReading(false)
    setElapsedSeconds(scopeRuntimeStart.elapsedSeconds)
    setPauseCount(scopeRuntimeStart.pauseCount)
    setRegressionCount(scopeRuntimeStart.regressionCount)
    setSegmentStartWordIndex(scopeRuntimeStart.localSegmentStart)
    setSegmentStartElapsedSeconds(scopeRuntimeStart.segmentStartElapsedSeconds)
    setManualVisiblePaneStartIndex(null)
    setSuggestion(null)
  }, [scopeRuntimeStart])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const element = readingSurfaceRef.current
    if (!element) {
      return undefined
    }

    const measuredElement = element

    function measureSurface(): void {
      const rect = measuredElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      setReaderSurfaceSize((size) => {
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (size.width === width && size.height === height) {
          return size
        }

        return { width, height }
      })
    }

    measureSurface()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureSurface)
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', measureSurface)
    return () => window.removeEventListener('resize', measureSurface)
  }, [isFocusMode, mode])

  useEffect(() => {
    if (!isRunning || !activeChunk || !activeScope) {
      return undefined
    }

    startedRef.current ??= Date.now()
    const duration = getChunkDurationMs(activeChunk.endWord - activeChunk.startWord, targetWpm)
    const timer = window.setTimeout(() => {
      const nextWordIndex = Math.min(activeChunk.endWord, activeScope.wordCount)
      setCursorWordIndex(nextWordIndex)
      setReadThroughWordIndex(nextWordIndex)
      rememberResume({ cursorWordIndex: nextWordIndex, readThroughWordIndex: nextWordIndex })
      if (nextWordIndex >= activeScope.wordCount) {
        setIsRunning(false)
        setHasStartedReading(true)
        if (nextWordIndex - segmentStartWordIndex >= comprehensionSuggestionThresholdWords) {
          setSuggestion('threshold')
        }
        return
      }

      if (activeWindow && activeScope.shouldAdvanceWindow(nextWordIndex, activeWindow)) {
        setManualVisiblePaneStartIndex(null)
        setActiveWindowStartWordIndex(activeScope.getNextWindow(activeWindow).startWordIndex)
      }
    }, duration)

    return () => window.clearTimeout(timer)
  }, [
    activeScope,
    activeChunk,
    activeWindow,
    comprehensionSuggestionThresholdWords,
    isRunning,
    rememberResume,
    segmentStartWordIndex,
    targetWpm,
  ])

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    if (!isFocusMode) {
      return undefined
    }

    function handleFocusExit(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      setIsFocusMode(false)
    }

    window.addEventListener('keydown', handleFocusExit)
    return () => window.removeEventListener('keydown', handleFocusExit)
  }, [isFocusMode])

  if (!document) {
    return (
      <section className="panel reader-empty" data-tour="reader-surface">
        <span className="eyebrow">Reader</span>
        <h1>Select a document</h1>
        <p>Saved readings appear in the Library. Choose one to start rail or phrase training.</p>
      </section>
    )
  }

  function buildSegment(endWordIndex = currentWordIndex): ReaderSegmentInput {
    const normalizedScopeEndWordIndex = Math.max(0, Math.min(endWordIndex, activeScope?.wordCount ?? endWordIndex))
    const normalizedScopeStartWordIndex = Math.max(0, Math.min(segmentStartWordIndex, normalizedScopeEndWordIndex))
    const scopeStartOffset = activeScope?.startWordOffset ?? 0
    return {
      mode,
      targetWpm,
      startWordIndex: scopeStartOffset + normalizedScopeStartWordIndex,
      endWordIndex: scopeStartOffset + normalizedScopeEndWordIndex,
      scopeStartWordIndex: normalizedScopeStartWordIndex,
      scopeEndWordIndex: normalizedScopeEndWordIndex,
      wordsRead: Math.max(0, normalizedScopeEndWordIndex - normalizedScopeStartWordIndex),
      durationSeconds: Math.max(1, elapsedSeconds - segmentStartElapsedSeconds),
      pauseCount,
      regressionCount,
      scope: {
        scopeType: activeScope?.scopeType ?? 'document',
        scopeLabel: activeScope?.scopeLabel ?? 'Full document',
        chapterId: activeScope?.chapterId ?? null,
        chapterTitle: activeScope?.chapterTitle ?? null,
        pageIds: activeScope?.pageIds ?? [],
        pageNumbers: activeScope?.pageNumbers ?? [],
        sourcePageNumbers: activeScope?.sourcePageNumbers ?? [],
      },
      segmentContentStartWordIndex: normalizedScopeStartWordIndex,
      segmentContent: activeScope
        ? materializeSegmentContent(activeScope, normalizedScopeStartWordIndex, normalizedScopeEndWordIndex)
        : '',
    }
  }

  function beginSegment(): void {
    const startWordIndex = Math.max(0, hasStartedReading ? cursorWordIndex : activeChunk?.startWord ?? segmentStartWordIndex)
    setHasStartedReading(false)
    setCursorWordIndex(startWordIndex)
    setReadThroughWordIndex(Math.max(readThroughWordIndex, activeChunk?.endWord ?? startWordIndex))
    setActiveWindowStartWordIndex(getWindowStartForWord(activeScope, startWordIndex))

    if (!hasStartedReading) {
      setSegmentStartWordIndex(startWordIndex)
      setSegmentStartElapsedSeconds(elapsedSeconds)
    }

    rememberResume({
      cursorWordIndex: startWordIndex,
      readThroughWordIndex: Math.max(readThroughWordIndex, activeChunk?.endWord ?? startWordIndex),
      segmentStartElapsedSeconds: hasStartedReading ? segmentStartElapsedSeconds : elapsedSeconds,
      segmentStartWordIndex: hasStartedReading ? segmentStartWordIndex : startWordIndex,
    })

    if (document && !hasStartedReading) {
      onSegmentStart(document.id, {
        startWordIndex: (activeScope?.startWordOffset ?? 0) + startWordIndex,
        startedAt: new Date().toISOString(),
        targetWpm,
      })
    }
  }

  function moveReaderCursor(wordIndex: number): void {
    const normalizedWordIndex = Math.max(0, Math.min(activeScope?.wordCount ?? 0, Math.round(wordIndex)))
    setCursorWordIndex(normalizedWordIndex)
    setReadThroughWordIndex(Math.max(readThroughWordIndex, normalizedWordIndex))
    setActiveWindowStartWordIndex(getWindowStartForWord(activeScope, normalizedWordIndex))
    setManualVisiblePaneStartIndex(null)
    setIsRunning(false)
    setSuggestion(null)
    rememberResume({
      cursorWordIndex: normalizedWordIndex,
      readThroughWordIndex: Math.max(readThroughWordIndex, normalizedWordIndex),
    })
  }

  function goToPreviousPane(): void {
    if (!activeScope || !activeWindow || isRunning) {
      return
    }

    setManualVisiblePaneStartIndex(Math.max(0, visiblePaneStartIndex - paneLayout.effectivePaneCount))
  }

  function goToNextPane(): void {
    if (!activeScope || !activeWindow || isRunning) {
      return
    }

    setManualVisiblePaneStartIndex(
      Math.min(Math.max(0, paneLayout.panes.length - paneLayout.effectivePaneCount), visiblePaneStartIndex + paneLayout.effectivePaneCount),
    )
  }

  function resetSegment(wordIndex: number): void {
    const normalizedWordIndex = Math.max(0, Math.round(wordIndex))
    setSegmentStartWordIndex(normalizedWordIndex)
    setSegmentStartElapsedSeconds(elapsedSeconds)
    setSuggestion(null)
    rememberResume({
      cursorWordIndex,
      readThroughWordIndex: currentWordIndex,
      segmentStartElapsedSeconds: elapsedSeconds,
      segmentStartWordIndex: normalizedWordIndex,
    })
    if (document) {
      onSegmentReset(document.id, (activeScope?.startWordOffset ?? 0) + normalizedWordIndex)
    }
  }

  function resetReaderRuntime(): void {
    setCursorWordIndex(0)
    setReadThroughWordIndex(0)
    setActiveWindowStartWordIndex(0)
    setIsRunning(false)
    setIsFocusMode(false)
    setHasStartedReading(false)
    setElapsedSeconds(0)
    setPauseCount(0)
    setRegressionCount(0)
    setSegmentStartWordIndex(0)
    setSegmentStartElapsedSeconds(0)
    setSuggestion(null)
  }

  function startTest(): void {
    setIsRunning(false)
    setIsFocusMode(false)
    setSuggestion(null)
    rememberResume({ readThroughWordIndex: currentWordIndex })
    onStartTest(buildSegment())
  }

  function startDocumentEdit(): void {
    if (!document) {
      return
    }

    setIsRunning(false)
    setIsFocusMode(false)
    setSuggestion(null)
    setDraftTitle(document.title)
    setDraftText(document.content)
    setEditError(null)
    setIsEditingDocument(true)
  }

  function cancelDocumentEdit(): void {
    setDraftTitle(document?.title ?? '')
    setDraftText(document?.content ?? '')
    setEditError(null)
    setIsEditingDocument(false)
  }

  function saveDocumentEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!document || !onUpdateDocument) {
      return
    }

    if (draftWordCount === 0) {
      setEditError('Add reading text before saving.')
      return
    }

    onUpdateDocument(document.id, {
      title: draftTitle,
      content: cleanedDraftText,
    })
    setEditError(null)
    setIsEditingDocument(false)
  }

  function pauseReading(): void {
    setIsRunning(false)
    setHasStartedReading(true)
    const nextPauseCount = pauseCount + 1
    setPauseCount(nextPauseCount)
    rememberResume({
      cursorWordIndex,
      pauseCount: nextPauseCount,
      readThroughWordIndex: currentWordIndex,
    })
    if (untestedWordCount >= comprehensionSuggestionThresholdWords) {
      setSuggestion('threshold')
    }
  }

  function changeMode(nextMode: ReaderMode): void {
    setMode(nextMode)
    rememberResume({ mode: nextMode })
  }

  function changePageLayout(nextPageLayout: PageLayout): void {
    setPageLayout(nextPageLayout)
    rememberResume({ pageLayout: nextPageLayout })
  }

  function changeChunkSize(nextChunkSize: number): void {
    const normalizedChunkSize = Math.max(1, Math.min(6, Math.round(nextChunkSize)))
    setChunkSize(normalizedChunkSize)
    rememberResume({ chunkSize: normalizedChunkSize })
  }

  function changeTargetWpm(nextTargetWpm: number): void {
    const normalizedWpm = clampWpm(nextTargetWpm)
    setTargetWpm(normalizedWpm)
    rememberResume({ targetWpm: normalizedWpm })
  }

  function toggleRunning(): void {
    if (isRunning) {
      pauseReading()
      return
    }

    beginSegment()
    setSuggestion(null)
    setIsRunning(true)
  }

  return (
    <section className={isFocusMode ? 'panel reader-panel reader-panel-focus' : 'panel reader-panel'} data-focus-mode={isFocusMode}>
      <div className="panel-header">
        <div>
          <span className="eyebrow">Reader</span>
          <h1>{document.title}</h1>
          {activeScope && <p className="reader-scope-kicker">{activeScope.scopeLabel}</p>}
        </div>
        <div className="reader-header-actions">
          <div className="reader-metrics">
            <span>{formatDuration(elapsedSeconds)}</span>
            <strong>{progress}%</strong>
          </div>
          <button className="secondary-button" onClick={onBackToLibrary} type="button">
            Back to library
          </button>
          {onUpdateDocument && (
            <button className="secondary-button" onClick={startDocumentEdit} type="button">
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditingDocument && (
        <form className="document-edit-form" onSubmit={saveDocumentEdit}>
          <label className="field">
            Title
            <input
              autoFocus
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
          </label>
          <label className="field">
            Text
            <textarea onChange={(event) => setDraftText(event.target.value)} value={draftText} />
          </label>
          <div className="document-edit-footer">
            <span>
              {draftWordCount.toLocaleString()} words - {estimatePages(draftWordCount)} pages
            </span>
            <div className="button-row compact">
              <button className="primary-button" type="submit">
                Save changes
              </button>
              <button className="secondary-button" onClick={cancelDocumentEdit} type="button">
                Cancel
              </button>
            </div>
          </div>
          {editError && <p className="form-message error">{editError}</p>}
        </form>
      )}

      {activeScope && (
        <ReaderScopeSetup
          chapters={chapters}
          document={document}
          onBeforeScopeChange={resetReaderRuntime}
          onScopeChange={onScopeChange}
          pages={pages}
          resumeMemory={resumeMemory}
          scope={activeScope}
          selection={scopeSelection}
          targetWpm={targetWpm}
        />
      )}

      <ReaderControls
        baselineResult={baselineResult}
        chunkSize={chunkSize}
        isFocusMode={isFocusMode}
        isRunning={isRunning}
        isTestAvailable={!isRunning && hasStartedReading && untestedWordCount > 0}
        mode={mode}
        pageLayout={pageLayout}
        canGoNextPane={canGoNextPane}
        canGoPreviousPane={canGoPreviousPane}
        onChunkSizeChange={changeChunkSize}
        onFocusModeToggle={() => setIsFocusMode((focused) => !focused)}
        onNextPane={goToNextPane}
        onTest={startTest}
        onModeChange={changeMode}
        onPageLayoutChange={changePageLayout}
        onPreviousPane={goToPreviousPane}
        onToggleRunning={toggleRunning}
        onWpmChange={changeTargetWpm}
        targetWpm={targetWpm}
      />

      {suggestion && (
        <section className="reader-test-suggestion" aria-live="polite">
          <div>
            <strong>
              You've read a while. Test comprehension?
            </strong>
            <span>
              {`${untestedWordCount.toLocaleString()} words are ready for a meaning-based check.`}
            </span>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => resetSegment(currentWordIndex)} type="button">
              Not now
            </button>
            <button className="primary-button" onClick={startTest} type="button">
              Test now
            </button>
          </div>
        </section>
      )}

      <div className="progress-track" aria-label="Reading progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div
        className={`reading-surface ${mode}`}
        data-tour="reader-surface"
        data-window-end={activeWindow?.endWordIndex ?? 0}
        data-window-start={activeWindow?.startWordIndex ?? 0}
        ref={readingSurfaceRef}
        style={{ fontSize, lineHeight }}
      >
        {mode === 'rsvp' ? (
          <div className="rsvp-frame">{activeChunk?.text ?? 'Done'}</div>
        ) : (
          <ReaderPaneLayout
            activeIndex={activeIndex}
            chunks={chunks}
            isCursorSelectionDisabled={isRunning}
            onSelectChunk={(chunk) => moveReaderCursor(chunk.startWord)}
            paneLayout={displayPaneLayout}
          />
        )}
      </div>
    </section>
  )
}

type ReaderScopeSetupProps = {
  chapters: DocumentChapterRecord[]
  document: DocumentRecord
  onScopeChange: (selection: ReaderScopeSelection) => void
  onBeforeScopeChange: () => void
  pages: DocumentPageRecord[]
  resumeMemory?: ReaderResumeMemory
  scope: ReaderContentModel
  selection: ReaderScopeSelection
  targetWpm: number
}

function ReaderScopeSetup({
  chapters,
  document,
  onScopeChange,
  onBeforeScopeChange,
  pages,
  resumeMemory,
  scope,
  selection,
  targetWpm,
}: ReaderScopeSetupProps) {
  const orderedChapters = useMemo(() => getOrderedDocumentChapters(document.id, chapters), [chapters, document.id])
  const selectedChapterId = scope.selectedChapterId ?? orderedChapters[0]?.id ?? null
  const selectedChapterPages = useMemo(
    () => (selectedChapterId ? getOrderedChapterPages(selectedChapterId, pages) : []),
    [pages, selectedChapterId],
  )
  const firstPageNumber = selectedChapterPages[0]?.pageNumber ?? null
  const selectedStartPageNumber = scope.selectedStartPageNumber ?? firstPageNumber
  const selectedEndPageNumber = scope.selectedEndPageNumber ?? selectedStartPageNumber

  function changeScopeType(scopeType: ReaderScopeSelection['scopeType']): void {
    onBeforeScopeChange()
    if (scopeType === 'document') {
      onScopeChange({ scopeType: 'document' })
      return
    }

    const savedSelection = readerResumeSlotToScopeSelection(getResumeSlotForScopeType(resumeMemory, scopeType))
    if (savedSelection) {
      onScopeChange(savedSelection)
      return
    }

    if (!selectedChapterId) {
      return
    }

    if (scopeType === 'chapter') {
      onScopeChange({ scopeType: 'chapter', chapterId: selectedChapterId })
      return
    }

    onScopeChange({
      scopeType: 'pages',
      chapterId: selectedChapterId,
      startPageNumber: firstPageNumber,
      endPageNumber: firstPageNumber,
    })
  }

  function changeChapter(chapterId: string): void {
    onBeforeScopeChange()
    const chapterPages = getOrderedChapterPages(chapterId, pages)
    const firstChapterPageNumber = chapterPages[0]?.pageNumber ?? null
    if (selection.scopeType === 'pages') {
      onScopeChange({
        scopeType: 'pages',
        chapterId,
        startPageNumber: firstChapterPageNumber,
        endPageNumber: firstChapterPageNumber,
      })
      return
    }

    onScopeChange({ scopeType: 'chapter', chapterId })
  }

  function changePageRange(boundary: 'start' | 'end', pageNumber: number): void {
    onBeforeScopeChange()
    let startPageNumber = boundary === 'start' ? pageNumber : selectedStartPageNumber
    let endPageNumber = boundary === 'end' ? pageNumber : selectedEndPageNumber
    if (!selectedChapterId || startPageNumber == null || endPageNumber == null) {
      return
    }

    if (boundary === 'start' && startPageNumber > endPageNumber) {
      endPageNumber = startPageNumber
    }

    if (boundary === 'end' && endPageNumber < startPageNumber) {
      startPageNumber = endPageNumber
    }

    onScopeChange({
      scopeType: 'pages',
      chapterId: selectedChapterId,
      startPageNumber,
      endPageNumber,
    })
  }

  return (
    <section className="reader-scope-panel" aria-label="Reader setup">
      <div className="reader-scope-summary">
        <span className="eyebrow">Scope</span>
        <strong>{scope.scopeLabel}</strong>
        <span>
          {scope.pageCount.toLocaleString()} page(s) - {scope.wordCount.toLocaleString()} words
        </span>
        <span>
          About {estimateReadingMinutes(scope.wordCount, targetWpm).toLocaleString()} min at {targetWpm.toLocaleString()} WPM
        </span>
      </div>

      <div className="reader-scope-controls">
        <div className="segmented scope-segmented" role="group" aria-label="Reading scope">
          {(['document', 'chapter', 'pages'] as const).map((scopeType) => (
            <button
              aria-pressed={scope.scopeType === scopeType}
              className={scope.scopeType === scopeType ? 'active' : ''}
              disabled={
                (scopeType !== 'document' && orderedChapters.length === 0)
                || (scopeType === 'pages' && selectedChapterPages.length === 0)
              }
              key={scopeType}
              onClick={() => changeScopeType(scopeType)}
              type="button"
            >
              {scopeType === 'document' ? 'Document' : scopeType === 'chapter' ? 'Chapter' : 'Pages'}
            </button>
          ))}
        </div>

        {scope.scopeType !== 'document' && (
          <label className="field compact">
            Chapter
            <select onChange={(event) => changeChapter(event.target.value)} value={selectedChapterId ?? ''}>
              {orderedChapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {scope.scopeType === 'pages' && (
          <>
            <label className="field compact">
              Start page
              <select
                onChange={(event) => changePageRange('start', Number(event.target.value))}
                value={selectedStartPageNumber ?? ''}
              >
                {selectedChapterPages.map((page) => (
                  <option key={page.id} value={page.pageNumber}>
                    Page {getReaderPageDisplayNumber(page)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact">
              End page
              <select
                onChange={(event) => changePageRange('end', Number(event.target.value))}
                value={selectedEndPageNumber ?? ''}
              >
                {selectedChapterPages.map((page) => (
                  <option key={page.id} value={page.pageNumber}>
                    Page {getReaderPageDisplayNumber(page)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </section>
  )
}

function readerResumeSlotToScopeSelection(slot: ReaderResumeSlot | undefined): ReaderScopeSelection | null {
  if (!slot) {
    return null
  }

  if (slot.scopeType === 'document') {
    return { scopeType: 'document' }
  }

  if (!slot.chapterId) {
    return null
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

function getResumeSlotForScopeType(
  memory: ReaderResumeMemory | undefined,
  scopeType: ReaderScopeSelection['scopeType'],
): ReaderResumeSlot | undefined {
  if (scopeType === 'document') {
    return memory?.document
  }

  const slots = scopeType === 'chapter' ? Object.values(memory?.chapters ?? {}) : Object.values(memory?.pageRanges ?? {})
  return slots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function getLocalSegmentStart(documentWordIndex: number, scope: ReaderContentModel | null): number {
  if (!scope || documentWordIndex < scope.startWordOffset || documentWordIndex > scope.endWordOffset) {
    return 0
  }

  return Math.max(0, Math.min(scope.wordCount, documentWordIndex - scope.startWordOffset))
}

type Chunk = { id: string; text: string; startWord: number; endWord: number; startsNewParagraph?: boolean }

function getWindowStartForWord(scope: ReaderContentModel | null, wordIndex: number): number {
  return scope?.getWindowForWord(wordIndex).startWordIndex ?? 0
}

function chunkWindowContent(window: ReaderContentWindow, chunkSize: number): Chunk[] {
  return chunkText(window.content, chunkSize).map((chunk) => ({
    ...chunk,
    id: `window_${window.startWordIndex}_${chunk.id}`,
    startWord: window.startWordIndex + chunk.startWord,
    endWord: window.startWordIndex + chunk.endWord,
  }))
}

function materializeSegmentContent(scope: ReaderContentModel, startWordIndex: number, endWordIndex: number): string {
  if (endWordIndex <= startWordIndex) {
    return ''
  }

  const parts: string[] = []
  let cursor = startWordIndex

  while (cursor < endWordIndex) {
    const window = scope.getWindow(cursor)
    if (window.endWordIndex <= cursor) {
      break
    }

    const relativeStartWordIndex = Math.max(0, cursor - window.startWordIndex)
    const relativeEndWordIndex = Math.min(endWordIndex, window.endWordIndex) - window.startWordIndex
    const text = tokenizeReadableWords(window.content)
      .slice(relativeStartWordIndex, relativeEndWordIndex)
      .join(' ')

    if (text) {
      parts.push(text)
    }
    cursor = Math.min(endWordIndex, window.endWordIndex)
  }

  return parts.join(' ')
}

function getChunkIndexForWord(chunks: Chunk[], wordIndex: number): number {
  if (chunks.length === 0) {
    return 0
  }

  const normalizedWordIndex = Math.max(0, Math.round(wordIndex))
  const exactIndex = chunks.findIndex(
    (chunk) => normalizedWordIndex >= chunk.startWord && normalizedWordIndex < chunk.endWord,
  )
  if (exactIndex >= 0) {
    return exactIndex
  }

  return normalizedWordIndex >= chunks[chunks.length - 1].endWord ? chunks.length - 1 : 0
}

type MultiPageLayoutProps = {
  chunks: Chunk[]
  activeIndex: number
  isCursorSelectionDisabled: boolean
  onSelectChunk: (chunk: Chunk) => void
  paneLayout: VirtualReaderPaneLayout<Chunk>
}

function ReaderPaneLayout({ chunks, activeIndex, isCursorSelectionDisabled, onSelectChunk, paneLayout }: MultiPageLayoutProps) {
  return (
    <div
      className="page-panes"
      data-effective-pane-count={paneLayout.effectivePaneCount}
      data-page-count={paneLayout.visiblePanes.length}
      data-visible-pane-start={paneLayout.visibleStartPaneIndex}
      style={{ gridTemplateColumns: `repeat(${paneLayout.visiblePanes.length || 1}, minmax(0, 1fr))` }}
    >
      {paneLayout.visiblePanes.map((pane, visibleIndex) => (
        <ReaderPane
          activeIndex={activeIndex}
          chunks={chunks}
          isCursorSelectionDisabled={isCursorSelectionDisabled}
          isActivePane={paneLayout.visibleStartPaneIndex + visibleIndex === paneLayout.activePaneIndex}
          key={pane.id}
          onSelectChunk={onSelectChunk}
          pane={pane}
        />
      ))}
    </div>
  )
}

type ReaderPaneProps = {
  activeIndex: number
  chunks: Chunk[]
  isCursorSelectionDisabled: boolean
  isActivePane: boolean
  onSelectChunk: (chunk: Chunk) => void
  pane: VirtualReaderPane<Chunk>
}

function ReaderPane({ activeIndex, chunks, isCursorSelectionDisabled, isActivePane, onSelectChunk, pane }: ReaderPaneProps) {
  return (
    <div className={`page-pane${isActivePane ? ' page-pane-active' : ''}`}>
      {pane.chunks.map((chunk) => {
        const globalIndex = chunks.indexOf(chunk)
        const isActive = globalIndex === activeIndex
        return (
          <span key={chunk.id}>
            {chunk.startsNewParagraph && <span className="para-break" aria-hidden="true" />}
            <button
              className={isActive ? 'reader-chunk active-chunk' : 'reader-chunk'}
              disabled={isCursorSelectionDisabled}
              onClick={() => onSelectChunk(chunk)}
              type="button"
            >
              {chunk.text}{' '}
            </button>
          </span>
        )
      })}
    </div>
  )
}
