import { describe, expect, it } from 'vitest'
import {
  buildFilledVisibleReaderPaneLayout,
  buildVirtualReaderPaneLayout,
  getActiveVirtualPaneIndex,
  getEffectiveReaderPaneCount,
  getVisiblePaneStartIndex,
  type ReaderPaneChunk,
} from '../lib/text/pages'

const metrics = {
  containerHeight: 220,
  containerWidth: 1400,
  fontSize: 20,
  lineHeight: 1.5,
  requestedPaneCount: 2,
}

function buildChunks(count: number): ReaderPaneChunk[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `chunk-${index}`,
    text: `${`word${index}`.repeat(20)} ending ${index}`,
    startWord: index,
    endWord: index + 1,
    startsNewParagraph: index > 0 && index % 3 === 0,
  }))
}

describe('buildVirtualReaderPaneLayout', () => {
  it('splits long reader text into viewport-fit virtual panes', () => {
    const layout = buildVirtualReaderPaneLayout(buildChunks(8), 0, metrics)

    expect(layout.effectivePaneCount).toBe(2)
    expect(layout.panes.length).toBeGreaterThan(2)
    expect(layout.visiblePanes).toHaveLength(2)
    expect(layout.panes.every((pane) => pane.estimatedLines <= layout.estimatedLinesPerPane)).toBe(true)
  })

  it('preserves every chunk in order across virtual panes', () => {
    const chunks = buildChunks(10)
    const layout = buildVirtualReaderPaneLayout(chunks, 0, metrics)

    expect(layout.panes.flatMap((pane) => pane.chunks.map((chunk) => chunk.id))).toEqual(
      chunks.map((chunk) => chunk.id),
    )
  })

  it('falls back to one visible pane when the container is narrow', () => {
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 520, requestedPaneCount: 4 })).toBe(1)
  })

  it('keeps two- and three-pane layouts distinct when the reader width can support them', () => {
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 760, requestedPaneCount: 2 })).toBe(2)
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 1060, requestedPaneCount: 3 })).toBe(3)
  })

  it('keeps three- and four-pane layouts bounded to available reader width', () => {
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 1060, requestedPaneCount: 3 })).toBe(3)
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 1420, requestedPaneCount: 4 })).toBe(4)
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 1260, requestedPaneCount: 4 })).toBe(3)
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 690, requestedPaneCount: 3 })).toBe(1)
  })

  it('identifies the active pane and advances the visible pane window', () => {
    const layout = buildVirtualReaderPaneLayout(buildChunks(8), 5, metrics)

    expect(getActiveVirtualPaneIndex(layout.panes, 5)).toBe(layout.activePaneIndex)
    expect(layout.activePaneIndex).toBeGreaterThan(0)
    expect(layout.visibleStartPaneIndex).toBe(getVisiblePaneStartIndex(layout.activePaneIndex, layout.panes.length, 2))
    expect(layout.visiblePanes.some((pane) => pane.startChunkIndex <= 5 && pane.endChunkIndex >= 5)).toBe(true)
  })

  it('does not overlap the previous pane group to fill a trailing partial group', () => {
    expect(getVisiblePaneStartIndex(4, 7, 4)).toBe(4)
    expect(getVisiblePaneStartIndex(6, 7, 4)).toBe(4)
  })

  it('fills a sparse active pane with nearby prior chunks', () => {
    const sparseMetrics = {
      containerHeight: 120,
      containerWidth: 360,
      fontSize: 20,
      lineHeight: 1.5,
      requestedPaneCount: 1,
    }
    const chunks: ReaderPaneChunk[] = [
      {
        id: 'setup-1',
        text: 'During that time she had fewer opportunities to obtain food and required help from the group.',
        startWord: 0,
        endWord: 15,
      },
      {
        id: 'setup-2',
        text: 'Bonobo societies depend on cooperative networks.',
        startWord: 15,
        endWord: 21,
      },
      {
        id: 'active',
        text: 'elephant societies are controlled by females, while',
        startWord: 21,
        endWord: 28,
      },
    ]
    const layout = buildVirtualReaderPaneLayout(chunks, 2, sparseMetrics)
    const filledLayout = buildFilledVisibleReaderPaneLayout(
      chunks,
      2,
      layout,
      sparseMetrics,
      layout.visibleStartPaneIndex,
    )

    expect(layout.visiblePanes[0]?.chunks.map((chunk) => chunk.id)).toEqual(['active'])
    expect(filledLayout.visiblePanes[0]?.chunks.map((chunk) => chunk.id)).toEqual(['setup-2', 'active'])
  })

  it('keeps filled three- and four-pane layouts on the sequential virtual panes', () => {
    const chunks = buildChunks(12)

    ;([3, 4] as const).forEach((requestedPaneCount) => {
      const wideMetrics = { ...metrics, containerWidth: 1720, requestedPaneCount }
      const layout = buildVirtualReaderPaneLayout(chunks, requestedPaneCount, wideMetrics)
      const filledLayout = buildFilledVisibleReaderPaneLayout(
        chunks,
        requestedPaneCount,
        layout,
        wideMetrics,
        layout.visibleStartPaneIndex,
      )

      expect(filledLayout.effectivePaneCount).toBe(requestedPaneCount)
      expect(filledLayout.visibleStartPaneIndex).toBe(layout.visibleStartPaneIndex)
      expect(filledLayout.visiblePanes).toEqual(layout.visiblePanes)
    })
  })
})
