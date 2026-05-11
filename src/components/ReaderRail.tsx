import { useEffect, useMemo, useRef, useState } from 'react'
import { chunkText, getChunkDurationMs } from '../lib/text/chunking'
import type { BaselineAssessmentResult, DocumentRecord, PageLayout, ReaderMode } from '../types/domain'
import { clampWpm, formatDuration } from '../lib/reading/pacing'
import { splitIntoPages, getActivePage } from '../lib/text/pages'
import { ReaderControls } from './ReaderControls'

type ReaderRailProps = {
  baselineResult: BaselineAssessmentResult | null
  document: DocumentRecord | null
  defaultMode: ReaderMode
  defaultWpm: number
  defaultChunkSize: number
  defaultPageLayout: PageLayout
  fontSize: number
  lineHeight: number
  onComplete: (input: {
    mode: ReaderMode
    targetWpm: number
    wordsRead: number
    durationSeconds: number
    pauseCount: number
    regressionCount: number
  }) => void
}

export function ReaderRail({
  baselineResult,
  document,
  defaultMode,
  defaultWpm,
  defaultChunkSize,
  defaultPageLayout,
  fontSize,
  lineHeight,
  onComplete,
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
  const startedRef = useRef<number | null>(null)

  const chunks = useMemo(() => chunkText(document?.content ?? '', chunkSize), [chunkSize, document?.content])
  const activeChunk = chunks[activeIndex]
  const progress = chunks.length ? Math.round(((activeIndex + 1) / chunks.length) * 100) : 0

  useEffect(() => {
    if (!isRunning || !activeChunk) {
      return undefined
    }

    startedRef.current ??= Date.now()
    const duration = getChunkDurationMs(activeChunk.endWord - activeChunk.startWord, targetWpm)
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => {
        if (index >= chunks.length - 1) {
          setIsRunning(false)
          return index
        }

        return index + 1
      })
    }, duration)

    return () => window.clearTimeout(timer)
  }, [activeChunk, activeIndex, chunks.length, isRunning, targetWpm])

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

  function finishSession(): void {
    setIsRunning(false)
    setIsFocusMode(false)
    onComplete({
      mode,
      targetWpm,
      wordsRead: activeChunk?.endWord ?? 0,
      durationSeconds: Math.max(1, elapsedSeconds),
      pauseCount,
      regressionCount,
    })
  }

  return (
    <section className={isFocusMode ? 'panel reader-panel reader-panel-focus' : 'panel reader-panel'} data-focus-mode={isFocusMode}>
      <div className="panel-header">
        <div>
          <span className="eyebrow">Reader</span>
          <h1>{document.title}</h1>
        </div>
        <div className="reader-metrics">
          <span>{formatDuration(elapsedSeconds)}</span>
          <strong>{progress}%</strong>
        </div>
      </div>

      <ReaderControls
        baselineResult={baselineResult}
        chunkSize={chunkSize}
        isFocusMode={isFocusMode}
        isRunning={isRunning}
        mode={mode}
        pageLayout={pageLayout}
        onChunkSizeChange={setChunkSize}
        onFocusModeToggle={() => setIsFocusMode((focused) => !focused)}
        onFinish={finishSession}
        onModeChange={setMode}
        onPageLayoutChange={setPageLayout}
        onRegression={() => setRegressionCount((count) => count + 1)}
        onRewind={() => setActiveIndex((index) => Math.max(0, index - 6))}
        onToggleRunning={() => {
          setIsRunning((running) => {
            if (running) {
              setPauseCount((count) => count + 1)
            }
            return !running
          })
        }}
        onWpmChange={(value) => setTargetWpm(clampWpm(value))}
        targetWpm={targetWpm}
      />

      <div className="progress-track" aria-label="Reading progress">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className={`reading-surface ${mode}`} data-tour="reader-surface" style={{ fontSize, lineHeight }}>
        {mode === 'rsvp' ? (
          <div className="rsvp-frame">{activeChunk?.text ?? 'Done'}</div>
        ) : pageLayout === 1 ? (
          chunks.map((chunk, index) => (
            <span className={index === activeIndex ? 'active-chunk' : ''} key={chunk.id}>
              {chunk.text}{' '}
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

type Chunk = { id: string; text: string; startWord: number; endWord: number }

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
                <span
                  className={isActive ? 'active-chunk' : ''}
                  key={chunk.id}
                  ref={isActive ? activeChunkRef : null}
                >
                  {chunk.text}{' '}
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
