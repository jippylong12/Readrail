// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderRail } from '../components/ReaderRail'
import { getComprehensionSuggestionThresholdWords } from '../lib/reading/comprehension'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord, PageLayout, ReaderMode } from '../types/domain'
import type { ReaderScopeSelection } from '../app/readerScopes'

const documentRecord: DocumentRecord = {
  id: 'document-1',
  title: 'Focus mode document',
  sourceType: 'paste',
  content: 'Focus mode should keep reader controls visible while the surrounding app chrome is hidden.',
  wordCount: 14,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archivedAt: null,
}

function buildChapter(document: DocumentRecord, id = 'chapter-1', title = 'Main text'): DocumentChapterRecord {
  return {
    id,
    documentId: document.id,
    title,
    sortOrder: 0,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function buildPage(
  document: DocumentRecord,
  chapterId: string,
  text = document.content,
  pageNumber = 1,
  sourcePageNumber: number | null = pageNumber,
): DocumentPageRecord {
  return {
    id: `page-${pageNumber}`,
    documentId: document.id,
    chapterId,
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
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function renderReader(defaultMode: ReaderMode = 'rail', defaultPageLayout: PageLayout = 1) {
  const chapter = buildChapter(documentRecord)
  return render(
    <ReaderRail
      baselineResult={null}
      chapters={[chapter]}
      defaultChunkSize={4}
      defaultMode={defaultMode}
      defaultPageLayout={defaultPageLayout}
      defaultWpm={240}
      document={documentRecord}
      fontSize={20}
      lineHeight={1.65}
      pages={[buildPage(documentRecord, chapter.id)]}
      scopeSelection={{ scopeType: 'document' }}
      segmentStartWordIndex={0}
      onBackToLibrary={vi.fn()}
      onSegmentReset={vi.fn()}
      onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
      onScopeChange={vi.fn()}
      onStartTest={vi.fn()}
    />,
  )
}

function buildLongDocument(wordCount = 10): DocumentRecord {
  const content = Array.from({ length: wordCount }, (_, index) => `viewportfitword${index}`.repeat(10)).join(' ')
  return {
    ...documentRecord,
    id: 'long-reader-document',
    content,
    wordCount,
  }
}

function renderLongReader({
  defaultChunkSize = 1,
  defaultPageLayout = 2,
  defaultWpm = 900,
  wordCount = 10,
}: {
  defaultChunkSize?: number
  defaultPageLayout?: PageLayout
  defaultWpm?: number
  wordCount?: number
} = {}) {
  const longDocument = buildLongDocument(wordCount)
  const chapter = buildChapter(longDocument)
  return render(
    <ReaderRail
      baselineResult={null}
      chapters={[chapter]}
      defaultChunkSize={defaultChunkSize}
      defaultMode="rail"
      defaultPageLayout={defaultPageLayout}
      defaultWpm={defaultWpm}
      document={longDocument}
      fontSize={20}
      lineHeight={1.65}
      pages={[buildPage(longDocument, chapter.id)]}
      scopeSelection={{ scopeType: 'document' }}
      segmentStartWordIndex={0}
      onBackToLibrary={vi.fn()}
      onSegmentReset={vi.fn()}
      onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
      onScopeChange={vi.fn()}
      onStartTest={vi.fn()}
    />,
  )
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('ReaderRail focus mode', () => {
  it('enters and exits immersive focus mode from the reader controls', async () => {
    const user = userEvent.setup()
    const { container } = renderReader()
    const readerPanel = container.querySelector('.reader-panel')

    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Focus' }))

    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(true)
    expect(screen.getByRole('button', { name: 'Exit Focus' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Exit Focus' }))

    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(false)
    expect(screen.getByRole('button', { name: 'Focus' })).toBeTruthy()
  })

  it('exits focus mode with Escape', async () => {
    const user = userEvent.setup()
    const { container } = renderReader()
    const readerPanel = container.querySelector('.reader-panel')

    await user.click(screen.getByRole('button', { name: 'Focus' }))
    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(true)

    await user.keyboard('{Escape}')

    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(false)
  })

  it('starts the test flow after reading begins and leaves focus mode', async () => {
    const user = userEvent.setup()
    const onStartTest = vi.fn()
    const chapter = buildChapter(documentRecord)
    const { container } = render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={240}
        document={documentRecord}
        fontSize={20}
        lineHeight={1.65}
        pages={[buildPage(documentRecord, chapter.id)]}
        scopeSelection={{ scopeType: 'document' }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={onStartTest}
      />,
    )
    const readerPanel = container.querySelector('.reader-panel')

    await user.click(screen.getByRole('button', { name: 'Focus' }))
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(onStartTest).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'rail',
        targetWpm: 240,
        startWordIndex: 0,
        endWordIndex: 4,
        wordsRead: 4,
        segmentContent: 'Focus mode should keep',
        segmentContentStartWordIndex: 0,
      }),
    )
    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(false)
  })

  it('keeps reader mode controls usable while focused', async () => {
    const user = userEvent.setup()
    const { container } = renderReader()

    await user.click(screen.getByRole('button', { name: 'Focus' }))
    await user.click(screen.getByRole('button', { name: 'Chunk' }))

    expect(container.querySelector('.reading-surface.chunk')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'RSVP' }))

    expect(container.querySelector('.reading-surface.rsvp')).toBeTruthy()
    expect(screen.getByText('Focus mode should keep')).toBeTruthy()
  })

  it('keeps compact focus layout hooks and reader controls available', async () => {
    const user = userEvent.setup()
    const { container } = renderLongReader({ defaultPageLayout: 2 })

    await user.click(screen.getByRole('button', { name: 'Focus' }))

    const readerPanel = container.querySelector('.reader-panel')
    const paneLayout = container.querySelector('.page-panes')

    expect(readerPanel?.getAttribute('data-focus-mode')).toBe('true')
    expect(readerPanel?.classList.contains('reader-panel-focus')).toBe(true)
    expect(paneLayout?.getAttribute('data-effective-pane-count')).toBe('2')
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exit Focus' })).toBeTruthy()
  })
})

describe('ReaderRail virtual panes', () => {
  it('rewinds one chunk, pauses playback, and resumes on the next play click', async () => {
    vi.useFakeTimers()
    const { container } = renderLongReader({
      defaultChunkSize: 1,
      defaultPageLayout: 1,
      defaultWpm: 900,
      wordCount: 8,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(280)
      })
    }

    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword3')

    fireEvent.click(screen.getByRole('button', { name: 'Rewind' }))

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword2')
    expect(container.querySelector('.active-chunk')?.textContent).not.toContain('viewportfitword0')

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(280)
    })

    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword3')
  })

  it('rereads from the current segment start and requires a new pause before testing', async () => {
    vi.useFakeTimers()
    const { container } = renderLongReader({
      defaultChunkSize: 1,
      defaultPageLayout: 1,
      defaultWpm: 900,
      wordCount: 8,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(280)
      })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy()
    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword3')

    fireEvent.click(screen.getByRole('button', { name: 'Reread' }))

    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword0')

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(280)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy()
    expect(container.querySelector('.active-chunk')?.textContent).toContain('viewportfitword1')
  })

  it('renders only the initial bounded content window for long documents', () => {
    const { container } = renderLongReader({ defaultPageLayout: 1, wordCount: 1_505 })
    const readingSurface = container.querySelector('.reading-surface')

    expect(readingSurface?.getAttribute('data-window-start')).toBe('0')
    expect(readingSurface?.getAttribute('data-window-end')).toBe('1000')
    expect(screen.getByText(/viewportfitword0/)).toBeTruthy()
    expect(screen.queryByText(/viewportfitword1000/)).toBeNull()
  })

  it('advances the content window and drops old rendered words during playback', async () => {
    const user = userEvent.setup()
    const { container } = renderLongReader({
      defaultChunkSize: 500,
      defaultPageLayout: 1,
      defaultWpm: 120_000,
      wordCount: 1_505,
    })
    const readingSurface = container.querySelector('.reading-surface')

    await user.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => {
      expect(readingSurface?.getAttribute('data-window-start')).toBe('500')
    }, { timeout: 800 })

    expect(readingSurface?.getAttribute('data-window-end')).toBe('1500')
    expect(screen.queryByText(/viewportfitword0/)).toBeNull()
    expect(screen.getByText(/viewportfitword500/)).toBeTruthy()
    expect(screen.queryByText(/viewportfitword1500/)).toBeNull()
  })

  it('renders selected pane counts as viewport panes instead of all source text columns', () => {
    const { container } = renderLongReader({ defaultPageLayout: 3, wordCount: 8 })
    const paneLayout = container.querySelector('.page-panes')

    expect(paneLayout?.getAttribute('data-effective-pane-count')).toBe('3')
    expect(container.querySelectorAll('.page-pane')).toHaveLength(3)
    expect(screen.getByText(/viewportfitword0/)).toBeTruthy()
    expect(screen.queryByText(/viewportfitword7/)).toBeNull()
  })

  it('advances the visible pane window as playback moves the active chunk', async () => {
    const user = userEvent.setup()
    const { container } = renderLongReader({ defaultPageLayout: 2, wordCount: 8 })

    expect(container.querySelector('.page-panes')?.getAttribute('data-visible-pane-start')).toBe('0')

    await user.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => {
      expect(container.querySelector('.page-panes')?.getAttribute('data-visible-pane-start')).toBe('4')
    }, { timeout: 1800 })
    expect(screen.queryByText(/viewportfitword0/)).toBeNull()
    expect(screen.getByText(/viewportfitword4/)).toBeTruthy()
  })
})

describe('ReaderRail scope setup', () => {
  it('switches from full document to a contiguous page range', async () => {
    const user = userEvent.setup()
    const chapter = buildChapter(documentRecord, 'chapter-1', 'Chapter One')
    const pages = [
      buildPage(documentRecord, chapter.id, 'First page words.', 1, 41),
      buildPage(documentRecord, chapter.id, 'Second page selected.', 2, 42),
      buildPage(documentRecord, chapter.id, 'Third page selected.', 3, 43),
    ]

    function ScopedReader() {
      const [scopeSelection, setScopeSelection] = useState<ReaderScopeSelection>({ scopeType: 'document' })
      return (
        <ReaderRail
          baselineResult={null}
          chapters={[chapter]}
          defaultChunkSize={4}
          defaultMode="rail"
          defaultPageLayout={1}
          defaultWpm={240}
          document={documentRecord}
          fontSize={20}
          lineHeight={1.65}
          pages={pages}
          scopeSelection={scopeSelection}
          segmentStartWordIndex={0}
          onBackToLibrary={vi.fn()}
          onSegmentReset={vi.fn()}
          onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
          onScopeChange={setScopeSelection}
          onStartTest={vi.fn()}
        />
      )
    }

    render(<ScopedReader />)

    await user.click(screen.getByRole('button', { name: 'Pages' }))
    await user.selectOptions(screen.getByLabelText('End page'), '3')

    expect(screen.getAllByText('Chapter One, pages 41-43')).toHaveLength(2)
    expect(screen.getByText('First page words.')).toBeTruthy()
    expect(screen.getByText('Second page selected.')).toBeTruthy()
    expect(screen.getByText('Third page selected.')).toBeTruthy()
  })

  it('clamps the opposite page boundary when a selected page crosses the range', async () => {
    const user = userEvent.setup()
    const chapter = buildChapter(documentRecord, 'chapter-1', 'Chapter One')
    const pages = [
      buildPage(documentRecord, chapter.id, 'First page words.', 1, 41),
      buildPage(documentRecord, chapter.id, 'Second page selected.', 2, 42),
      buildPage(documentRecord, chapter.id, 'Third page selected.', 3, 43),
      buildPage(documentRecord, chapter.id, 'Fourth page selected.', 4, 44),
      buildPage(documentRecord, chapter.id, 'Fifth page selected.', 5, 45),
    ]

    function ScopedReader() {
      const [scopeSelection, setScopeSelection] = useState<ReaderScopeSelection>({
        scopeType: 'pages',
        chapterId: chapter.id,
        startPageNumber: 1,
        endPageNumber: 2,
      })
      return (
        <ReaderRail
          baselineResult={null}
          chapters={[chapter]}
          defaultChunkSize={4}
          defaultMode="rail"
          defaultPageLayout={1}
          defaultWpm={240}
          document={documentRecord}
          fontSize={20}
          lineHeight={1.65}
          pages={pages}
          scopeSelection={scopeSelection}
          segmentStartWordIndex={0}
          onBackToLibrary={vi.fn()}
          onSegmentReset={vi.fn()}
          onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
          onScopeChange={setScopeSelection}
          onStartTest={vi.fn()}
        />
      )
    }

    render(<ScopedReader />)

    await user.selectOptions(screen.getByLabelText('Start page'), '3')

    expect(screen.getByLabelText('Start page')).toHaveProperty('value', '3')
    expect(screen.getByLabelText('End page')).toHaveProperty('value', '3')
    expect(screen.getAllByText('Chapter One, page 43')).toHaveLength(2)
    expect(screen.queryByText('Second page selected.')).toBeNull()
    expect(screen.getByText('Third page selected.')).toBeTruthy()

    await user.selectOptions(screen.getByLabelText('End page'), '2')

    expect(screen.getByLabelText('Start page')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('End page')).toHaveProperty('value', '2')
    expect(screen.getAllByText('Chapter One, page 42')).toHaveLength(2)
    expect(screen.getByText('Second page selected.')).toBeTruthy()
    expect(screen.queryByText('Third page selected.')).toBeNull()
  })

  it('shows the selected scope reading-time estimate at the active WPM', () => {
    const chapter = buildChapter(documentRecord, 'chapter-1', 'Chapter One')
    const pages = [
      buildPage(documentRecord, chapter.id, Array.from({ length: 500 }, (_, index) => `word${index}`).join(' '), 1),
    ]

    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={250}
        document={{ ...documentRecord, wordCount: 500 }}
        fontSize={20}
        lineHeight={1.65}
        pages={pages}
        scopeSelection={{ scopeType: 'pages', chapterId: chapter.id, startPageNumber: 1, endPageNumber: 1 }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    expect(screen.getByText('About 2 min at 250 WPM')).toBeTruthy()

    const wpmInput = screen.getByRole('slider', { name: /WPM/ })
    fireEvent.change(wpmInput, { target: { value: '125' } })

    expect(screen.getByText('About 4 min at 125 WPM')).toBeTruthy()
  })

  it('reads only the selected scoped page text and reports document-level offsets', async () => {
    const user = userEvent.setup()
    const onStartTest = vi.fn()
    const chapter = buildChapter(documentRecord, 'chapter-1', 'Chapter One')
    const pages = [
      buildPage(documentRecord, chapter.id, 'First page only.', 1),
      buildPage(documentRecord, chapter.id, 'Second page scoped.', 2),
      buildPage(documentRecord, chapter.id, 'Third page excluded.', 3),
    ]

    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={3}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={240}
        document={{ ...documentRecord, wordCount: 9 }}
        fontSize={20}
        lineHeight={1.65}
        pages={pages}
        scopeSelection={{ scopeType: 'pages', chapterId: chapter.id, startPageNumber: 2, endPageNumber: 2 }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={onStartTest}
      />,
    )

    expect(screen.queryByText('First page only.')).toBeNull()
    expect(screen.getByText('Second page scoped.')).toBeTruthy()
    expect(screen.queryByText('Third page excluded.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(onStartTest).toHaveBeenCalledWith(
      expect.objectContaining({
        startWordIndex: 3,
        endWordIndex: 6,
        scopeStartWordIndex: 0,
        scopeEndWordIndex: 3,
        wordsRead: 3,
        segmentContent: 'Second page scoped.',
        segmentContentStartWordIndex: 0,
        scope: expect.objectContaining({
          scopeType: 'pages',
          scopeLabel: 'Chapter One, page 2',
          pageNumbers: [2],
        }),
      }),
    )
  })
})

describe('ReaderRail comprehension prompts', () => {
  it('uses one hour of reading at the active target WPM as the suggestion threshold', () => {
    expect(getComprehensionSuggestionThresholdWords(300)).toBe(18_000)
  })

  it('pauses below the threshold without suggesting a test', async () => {
    const user = userEvent.setup()
    const onSegmentReset = vi.fn()
    const chapter = buildChapter(documentRecord)
    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={240}
        document={documentRecord}
        fontSize={20}
        lineHeight={1.65}
        pages={[buildPage(documentRecord, chapter.id)]}
        scopeSelection={{ scopeType: 'document' }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={onSegmentReset}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.queryByText("You've read a while. Test comprehension?")).toBeNull()
    expect(onSegmentReset).not.toHaveBeenCalled()
  })

  it('does not suggest a test at 1000 words when the one-hour threshold is higher', async () => {
    const user = userEvent.setup()
    const documentUnderThreshold: DocumentRecord = {
      ...documentRecord,
      id: 'document-under-threshold',
      content: Array.from({ length: 1005 }, (_, index) => `word${index}`).join(' '),
      wordCount: 1005,
    }
    const chapter = buildChapter(documentUnderThreshold)

    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={1000}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={300}
        document={documentUnderThreshold}
        fontSize={20}
        lineHeight={1.65}
        pages={[buildPage(documentUnderThreshold, chapter.id)]}
        scopeSelection={{ scopeType: 'document' }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.queryByText("You've read a while. Test comprehension?")).toBeNull()
  })

  it('suggests a test after one hour of target-WPM words within the active window', async () => {
    vi.useFakeTimers()
    const onSegmentReset = vi.fn()
    const longDocument: DocumentRecord = {
      ...documentRecord,
      id: 'long-document',
      content: Array.from({ length: 4805 }, (_, index) => `word${index}`).join(' '),
      wordCount: 4805,
    }
    const chapter = buildChapter(longDocument)

    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={100}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={80}
        document={longDocument}
        fontSize={20}
        lineHeight={1.65}
        pages={[buildPage(longDocument, chapter.id)]}
        scopeSelection={{ scopeType: 'document' }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={onSegmentReset}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    for (let index = 0; index < 47; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(75_000)
      })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.getByText("You've read a while. Test comprehension?")).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(onSegmentReset).toHaveBeenCalledWith('long-document', 4800)
  })

  it('finishes short documents without opening a suggested-test prompt', async () => {
    const user = userEvent.setup()
    const onStartTest = vi.fn()
    const shortDocument: DocumentRecord = {
      ...documentRecord,
      id: 'short-document',
      content: 'one two three four',
      wordCount: 4,
    }
    const chapter = buildChapter(shortDocument)

    render(
      <ReaderRail
        baselineResult={null}
        chapters={[chapter]}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={900}
        document={shortDocument}
        fontSize={20}
        lineHeight={1.65}
        pages={[buildPage(shortDocument, chapter.id)]}
        scopeSelection={{ scopeType: 'document' }}
        segmentStartWordIndex={0}
        onBackToLibrary={vi.fn()}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
          onResumeUpdate={vi.fn()}
        onScopeChange={vi.fn()}
        onStartTest={onStartTest}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy(), { timeout: 700 })

    expect(screen.queryByText('You reached the end. Test comprehension?')).toBeNull()
    expect(screen.queryByText("You've read a while. Test comprehension?")).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(onStartTest).toHaveBeenCalledWith(
      expect.objectContaining({
        startWordIndex: 0,
        endWordIndex: 4,
        wordsRead: 4,
      }),
    )
  })
})
