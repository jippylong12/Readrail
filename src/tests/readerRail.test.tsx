// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderRail } from '../components/ReaderRail'
import type { DocumentRecord, ReaderMode } from '../types/domain'

const documentRecord: DocumentRecord = {
  id: 'document-1',
  title: 'Focus mode document',
  sourceType: 'paste',
  content: 'Focus mode should keep reader controls visible while the surrounding app chrome is hidden.',
  wordCount: 14,
  estimatedPages: 1,
  language: 'en',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archivedAt: null,
}

function renderReader(defaultMode: ReaderMode = 'rail') {
  return render(
    <ReaderRail
      baselineResult={null}
      defaultChunkSize={4}
      defaultMode={defaultMode}
      defaultPageLayout={1}
      defaultWpm={240}
      document={documentRecord}
      fontSize={20}
      lineHeight={1.65}
      segmentStartWordIndex={0}
      onSegmentReset={vi.fn()}
      onSegmentStart={vi.fn()}
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
    const { container } = render(
      <ReaderRail
        baselineResult={null}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={240}
        document={documentRecord}
        fontSize={20}
        lineHeight={1.65}
        segmentStartWordIndex={0}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
        onStartTest={onStartTest}
      />,
    )
    const readerPanel = container.querySelector('.reader-panel')

    await user.click(screen.getByRole('button', { name: 'Focus' }))
    expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(onStartTest).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'rail',
        targetWpm: 240,
        startWordIndex: 0,
        endWordIndex: 4,
        wordsRead: 4,
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
})

describe('ReaderRail comprehension prompts', () => {
  it('pauses below the threshold without suggesting a test', async () => {
    const user = userEvent.setup()
    const onSegmentReset = vi.fn()
    render(
      <ReaderRail
        baselineResult={null}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={240}
        document={documentRecord}
        fontSize={20}
        lineHeight={1.65}
        segmentStartWordIndex={0}
        onSegmentReset={onSegmentReset}
        onSegmentStart={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.queryByText("You've read a while. Test comprehension?")).toBeNull()
    expect(onSegmentReset).not.toHaveBeenCalled()
  })

  it('suggests a test at 1000 words on pause and decline resets the segment', async () => {
    const user = userEvent.setup()
    const onSegmentReset = vi.fn()
    const longDocument: DocumentRecord = {
      ...documentRecord,
      id: 'long-document',
      content: Array.from({ length: 1005 }, (_, index) => `word${index}`).join(' '),
      wordCount: 1005,
    }

    render(
      <ReaderRail
        baselineResult={null}
        defaultChunkSize={1000}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={900}
        document={longDocument}
        fontSize={20}
        lineHeight={1.65}
        segmentStartWordIndex={0}
        onSegmentReset={onSegmentReset}
        onSegmentStart={vi.fn()}
        onStartTest={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(screen.getByText("You've read a while. Test comprehension?")).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(onSegmentReset).toHaveBeenCalledWith('long-document', 1000)
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

    render(
      <ReaderRail
        baselineResult={null}
        defaultChunkSize={4}
        defaultMode="rail"
        defaultPageLayout={1}
        defaultWpm={900}
        document={shortDocument}
        fontSize={20}
        lineHeight={1.65}
        segmentStartWordIndex={0}
        onSegmentReset={vi.fn()}
        onSegmentStart={vi.fn()}
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
