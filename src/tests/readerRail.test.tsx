// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
      onComplete={vi.fn()}
    />,
  )
}

afterEach(() => {
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

  it('finishes the session and leaves focus mode', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
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
        onComplete={onComplete}
      />,
    )
    const readerPanel = container.querySelector('.reader-panel')

    await user.click(screen.getByRole('button', { name: 'Focus' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'rail',
        targetWpm: 240,
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
