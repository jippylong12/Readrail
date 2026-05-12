import { describe, expect, it } from 'vitest'
import {
  buildVirtualReaderPaneLayout,
  getActiveVirtualPaneIndex,
  getEffectiveReaderPaneCount,
  getVisiblePaneStartIndex,
  type ReaderPaneChunk,
} from '../lib/text/pages'

const metrics = {
  containerHeight: 220,
  containerWidth: 1000,
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

  it('keeps two- and three-pane layouts distinct at medium reader widths', () => {
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 760, requestedPaneCount: 2 })).toBe(2)
    expect(getEffectiveReaderPaneCount({ ...metrics, containerWidth: 760, requestedPaneCount: 3 })).toBe(3)
  })

  it('identifies the active pane and advances the visible pane window', () => {
    const layout = buildVirtualReaderPaneLayout(buildChunks(8), 5, metrics)

    expect(getActiveVirtualPaneIndex(layout.panes, 5)).toBe(layout.activePaneIndex)
    expect(layout.activePaneIndex).toBeGreaterThanOrEqual(4)
    expect(layout.visibleStartPaneIndex).toBe(getVisiblePaneStartIndex(layout.activePaneIndex, layout.panes.length, 2))
    expect(layout.visiblePanes.some((pane) => pane.startChunkIndex <= 5 && pane.endChunkIndex >= 5)).toBe(true)
  })
})
