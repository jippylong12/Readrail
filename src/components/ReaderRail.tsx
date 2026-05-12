import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { chunkText, getChunkDurationMs } from '../lib/text/chunking'
import type {
  BaselineAssessmentResult,
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  PageLayout,
  ReaderMode,
} from '../types/domain'
import { clampWpm, formatDuration } from '../lib/reading/pacing'
import { cleanReadingText } from '../lib/text/cleanup'
import { splitIntoPages, getActivePage } from '../lib/text/pages'
import { countWords, estimatePages } from '../lib/text/wordCount'
import { ReaderControls } from './ReaderControls'
import {
  buildReaderScope,
  getReaderPageDisplayNumber,
  type BuiltReaderScope,
  type ReaderScopeSelection,
  type ReaderSessionScopeMetadata,
} from '../app/readerScopes'
import { getOrderedChapterPages, getOrderedDocumentChapters } from '../app/structuredDocuments'

export const COMPREHENSION_TEST_THRESHOLD_WORDS = 1000

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
  scopeContent: string
}

type ReaderRailProps = {
  baselineResult: BaselineAssessmentResult | null
  chapters: DocumentChapterRecord[]
  document: DocumentRecord | null
  pages: DocumentPageRecord[]
  scopeSelection: ReaderScopeSelection
  defaultMode: ReaderMode
  defaultWpm: number
  defaultChunkSize: number
  defaultPageLayout: PageLayout
  fontSize: number
  lineHeight: number
  segmentStartWordIndex: number
  onBackToLibrary: () => void
  onSegmentReset: (documentId: string, wordIndex: number) => void
  onSegmentStart: (documentId: string, segment: { startWordIndex: number; startedAt: string; targetWpm: number }) => void
  onScopeChange: (selection: ReaderScopeSelection) => void
  onStartTest: (input: ReaderSegmentInput) => void
  onUpdateDocument?: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
}

export function ReaderRail({
  baselineResult,
  chapters,
  document,
  pages,
  scopeSelection,
  defaultMode,
  defaultWpm,
  defaultChunkSize,
  defaultPageLayout,
  fontSize,
  lineHeight,
  segmentStartWordIndex: initialSegmentStartWordIndex,
  onBackToLibrary,
  onSegmentReset,
  onSegmentStart,
  onScopeChange,
  onStartTest,
  onUpdateDocument,
}: ReaderRailProps) {
  const [mode, setMode] = useState<ReaderMode>(defaultMode)
  const [targetWpm, setTargetWpm] = useState(defaultWpm)
  const [chunkSize, setChunkSize] = useState(defaultChunkSize)
  const [pageLayout, setPageLayout] = useState<PageLayout>(defaultPageLayout)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [pauseCount, setPauseCount] = useState(0)
  const [regressionCount, setRegressionCount] = useState(0)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [hasStartedReading, setHasStartedReading] = useState(false)
  const [segmentStartElapsedSeconds, setSegmentStartElapsedSeconds] = useState(0)
  const [suggestion, setSuggestion] = useState<'threshold' | null>(null)
  const [isEditingDocument, setIsEditingDocument] = useState(false)
  const [draftTitle, setDraftTitle] = useState(document?.title ?? '')
  const [draftText, setDraftText] = useState(document?.content ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const startedRef = useRef<number | null>(null)

  const activeScope = useMemo(
    () => (document ? buildReaderScope(document, chapters, pages, scopeSelection) : null),
    [chapters, document, pages, scopeSelection],
  )
  const [segmentStartWordIndex, setSegmentStartWordIndex] = useState(() =>
    getLocalSegmentStart(initialSegmentStartWordIndex, activeScope),
  )
  const chunks = useMemo(() => chunkText(activeScope?.content ?? '', chunkSize), [activeScope?.content, chunkSize])
  const activeChunk = chunks[activeIndex]
  const currentWordIndex = activeChunk?.endWord ?? 0
  const untestedWordCount = Math.max(0, currentWordIndex - segmentStartWordIndex)
  const progress = chunks.length ? Math.round(((activeIndex + 1) / chunks.length) * 100) : 0
  const cleanedDraftText = useMemo(
    () => cleanReadingText(draftText, { preservePageBreaks: true }),
    [draftText],
  )
  const draftWordCount = countWords(cleanedDraftText)

  useEffect(() => {
    if (!isRunning || !activeChunk) {
      return undefined
    }

    startedRef.current ??= Date.now()
    const duration = getChunkDurationMs(activeChunk.endWord - activeChunk.startWord, targetWpm)
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => {
        if (index >= chunks.length - 1) {
          const finalWordIndex = chunks[index]?.endWord ?? document?.wordCount ?? currentWordIndex
          setIsRunning(false)
          if (finalWordIndex - segmentStartWordIndex >= COMPREHENSION_TEST_THRESHOLD_WORDS) {
            setSuggestion('threshold')
          }
          return index
        }

        return index + 1
      })
    }, duration)

    return () => window.clearTimeout(timer)
  }, [activeChunk, activeIndex, chunks, currentWordIndex, document?.wordCount, isRunning, segmentStartWordIndex, targetWpm])

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
      scopeContent: activeScope?.content ?? '',
    }
  }

  function beginSegmentIfNeeded(): void {
    if (hasStartedReading) {
      return
    }

    const startWordIndex = Math.max(0, activeChunk?.startWord ?? segmentStartWordIndex)
    setHasStartedReading(true)
    setSegmentStartWordIndex(startWordIndex)
    setSegmentStartElapsedSeconds(elapsedSeconds)
    if (document) {
      onSegmentStart(document.id, {
        startWordIndex: (activeScope?.startWordOffset ?? 0) + startWordIndex,
        startedAt: new Date().toISOString(),
        targetWpm,
      })
    }
  }

  function resetSegment(wordIndex: number): void {
    const normalizedWordIndex = Math.max(0, Math.round(wordIndex))
    setSegmentStartWordIndex(normalizedWordIndex)
    setSegmentStartElapsedSeconds(elapsedSeconds)
    setSuggestion(null)
    if (document) {
      onSegmentReset(document.id, (activeScope?.startWordOffset ?? 0) + normalizedWordIndex)
    }
  }

  function resetReaderRuntime(): void {
    setActiveIndex(0)
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
    setPauseCount((count) => count + 1)
    if (untestedWordCount >= COMPREHENSION_TEST_THRESHOLD_WORDS) {
      setSuggestion('threshold')
    }
  }

  function toggleRunning(): void {
    if (isRunning) {
      pauseReading()
      return
    }

    beginSegmentIfNeeded()
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
          scope={activeScope}
          selection={scopeSelection}
        />
      )}

      <ReaderControls
        baselineResult={baselineResult}
        chunkSize={chunkSize}
        isFocusMode={isFocusMode}
        isRunning={isRunning}
        isTestAvailable={hasStartedReading && untestedWordCount > 0}
        mode={mode}
        pageLayout={pageLayout}
        onChunkSizeChange={setChunkSize}
        onFocusModeToggle={() => setIsFocusMode((focused) => !focused)}
        onTest={startTest}
        onModeChange={setMode}
        onPageLayoutChange={setPageLayout}
        onRegression={() => setRegressionCount((count) => count + 1)}
        onRewind={() => setActiveIndex((index) => Math.max(0, index - 6))}
        onToggleRunning={toggleRunning}
        onWpmChange={(value) => setTargetWpm(clampWpm(value))}
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

      <div className={`reading-surface ${mode}`} data-tour="reader-surface" style={{ fontSize, lineHeight }}>
        {mode === 'rsvp' ? (
          <div className="rsvp-frame">{activeChunk?.text ?? 'Done'}</div>
        ) : pageLayout === 1 ? (
          chunks.map((chunk, index) => (
            <span key={chunk.id}>
              {chunk.startsNewParagraph && <span className="para-break" aria-hidden="true" />}
              <span className={index === activeIndex ? 'active-chunk' : ''}>
                {chunk.text}{' '}
              </span>
            </span>
          ))
        ) : (
          <MultiPageLayout
            activeIndex={activeIndex}
            chunks={chunks}
            pageLayout={pageLayout}
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
  scope: BuiltReaderScope
  selection: ReaderScopeSelection
}

function ReaderScopeSetup({
  chapters,
  document,
  onScopeChange,
  onBeforeScopeChange,
  pages,
  scope,
  selection,
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
    const startPageNumber = boundary === 'start' ? pageNumber : selectedStartPageNumber
    const endPageNumber = boundary === 'end' ? pageNumber : selectedEndPageNumber
    if (!selectedChapterId || !startPageNumber || !endPageNumber) {
      return
    }

    onScopeChange({
      scopeType: 'pages',
      chapterId: selectedChapterId,
      startPageNumber: Math.min(startPageNumber, endPageNumber),
      endPageNumber: Math.max(startPageNumber, endPageNumber),
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

function getLocalSegmentStart(documentWordIndex: number, scope: BuiltReaderScope | null): number {
  if (!scope || documentWordIndex < scope.startWordOffset || documentWordIndex > scope.endWordOffset) {
    return 0
  }

  return Math.max(0, Math.min(scope.wordCount, documentWordIndex - scope.startWordOffset))
}

type Chunk = { id: string; text: string; startWord: number; endWord: number; startsNewParagraph?: boolean }

type MultiPageLayoutProps = {
  chunks: Chunk[]
  activeIndex: number
  pageLayout: PageLayout
}

function MultiPageLayout({ chunks, activeIndex, pageLayout }: MultiPageLayoutProps) {
  const activeChunkRef = useRef<HTMLSpanElement | null>(null)
  const pages = useMemo(() => splitIntoPages(chunks, pageLayout), [chunks, pageLayout])
  const activePage = getActivePage(activeIndex, chunks.length, pageLayout)

  useEffect(() => {
    activeChunkRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  return (
    <div
      className="page-panes"
      data-page-count={pages.length}
      style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }}
    >
      {pages.map((pageChunks, pageIndex) => {
        const isActivePage = pageIndex === activePage
        return (
          <div
            className={`page-pane${isActivePage ? ' page-pane-active' : ''}`}
            key={pageIndex}
          >
            {pageChunks.map((chunk) => {
              const globalIndex = chunks.indexOf(chunk)
              const isActive = globalIndex === activeIndex
              return (
                <span key={chunk.id}>
                  {chunk.startsNewParagraph && <span className="para-break" aria-hidden="true" />}
                  <span
                    className={isActive ? 'active-chunk' : ''}
                    ref={isActive ? activeChunkRef : null}
                  >
                    {chunk.text}{' '}
                  </span>
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
