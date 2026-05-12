export type ReaderPaneChunk = {
  id: string
  text: string
  startWord: number
  endWord: number
  startsNewParagraph?: boolean
}

export type ReaderPaneMetrics = {
  containerWidth: number
  containerHeight: number
  fontSize: number
  lineHeight: number
  requestedPaneCount: number
  gap?: number
  mobileBreakpoint?: number
  panePaddingBlock?: number
  panePaddingInline?: number
  surfacePaddingBlock?: number
  surfacePaddingInline?: number
  minPaneWidth?: number
}

export type VirtualReaderPane<TChunk extends ReaderPaneChunk = ReaderPaneChunk> = {
  id: string
  chunks: TChunk[]
  startChunkIndex: number
  endChunkIndex: number
  startWord: number
  endWord: number
  estimatedLines: number
}

export type VirtualReaderPaneLayout<TChunk extends ReaderPaneChunk = ReaderPaneChunk> = {
  panes: Array<VirtualReaderPane<TChunk>>
  visiblePanes: Array<VirtualReaderPane<TChunk>>
  activePaneIndex: number
  visibleStartPaneIndex: number
  effectivePaneCount: number
  estimatedLinesPerPane: number
}

const DEFAULT_GAP = 16
const DEFAULT_MIN_PANE_WIDTH = 280
const DEFAULT_MOBILE_BREAKPOINT = 720
const DEFAULT_PANE_PADDING_BLOCK = 40
const DEFAULT_PANE_PADDING_INLINE = 44
const DEFAULT_SURFACE_PADDING_BLOCK = 56
const DEFAULT_SURFACE_PADDING_INLINE = 56
const AVERAGE_READER_CHARACTER_WIDTH_EM = 0.54

export function buildVirtualReaderPaneLayout<TChunk extends ReaderPaneChunk>(
  chunks: TChunk[],
  activeIndex: number,
  metrics: ReaderPaneMetrics,
): VirtualReaderPaneLayout<TChunk> {
  const effectivePaneCount = getEffectiveReaderPaneCount(metrics)
  const estimatedLinesPerPane = getEstimatedLinesPerPane(metrics, effectivePaneCount)
  const panes = splitChunksIntoVirtualPanes(chunks, estimatedLinesPerPane, metrics)
  const activePaneIndex = getActiveVirtualPaneIndex(panes, activeIndex)
  const visibleStartPaneIndex = getVisiblePaneStartIndex(activePaneIndex, panes.length, effectivePaneCount)

  return {
    panes,
    visiblePanes: panes.slice(visibleStartPaneIndex, visibleStartPaneIndex + effectivePaneCount),
    activePaneIndex,
    visibleStartPaneIndex,
    effectivePaneCount,
    estimatedLinesPerPane,
  }
}

export function getEffectiveReaderPaneCount(metrics: ReaderPaneMetrics): number {
  const requestedPaneCount = clampPaneCount(metrics.requestedPaneCount)

  if (requestedPaneCount === 1 || metrics.containerWidth <= 0) {
    return requestedPaneCount
  }

  if (metrics.containerWidth < (metrics.mobileBreakpoint ?? DEFAULT_MOBILE_BREAKPOINT)) {
    return 1
  }

  const gap = metrics.gap ?? DEFAULT_GAP
  const minPaneWidth = metrics.minPaneWidth ?? DEFAULT_MIN_PANE_WIDTH
  const surfacePaddingInline = metrics.surfacePaddingInline ?? DEFAULT_SURFACE_PADDING_INLINE
  const availableWidth = Math.max(0, metrics.containerWidth - surfacePaddingInline)
  const maxPaneCount = Math.max(1, Math.floor((availableWidth + gap) / (minPaneWidth + gap)))

  return Math.max(1, Math.min(requestedPaneCount, maxPaneCount))
}

export function getActiveVirtualPaneIndex<TChunk extends ReaderPaneChunk>(
  panes: Array<VirtualReaderPane<TChunk>>,
  activeIndex: number,
): number {
  if (panes.length === 0) {
    return 0
  }

  const normalizedActiveIndex = Math.max(0, activeIndex)
  const paneIndex = panes.findIndex(
    (pane) => normalizedActiveIndex >= pane.startChunkIndex && normalizedActiveIndex <= pane.endChunkIndex,
  )

  return paneIndex >= 0 ? paneIndex : panes.length - 1
}

export function getVisiblePaneStartIndex(activePaneIndex: number, paneCount: number, visiblePaneCount: number): number {
  if (paneCount <= visiblePaneCount) {
    return 0
  }

  const normalizedVisiblePaneCount = Math.max(1, visiblePaneCount)
  const normalizedActivePaneIndex = Math.max(0, Math.min(activePaneIndex, paneCount - 1))
  const windowOffset = normalizedActivePaneIndex % normalizedVisiblePaneCount
  const firstPaneInWindow = normalizedActivePaneIndex - windowOffset

  return Math.min(firstPaneInWindow, Math.max(0, paneCount - normalizedVisiblePaneCount))
}

function splitChunksIntoVirtualPanes<TChunk extends ReaderPaneChunk>(
  chunks: TChunk[],
  maxLinesPerPane: number,
  metrics: ReaderPaneMetrics,
): Array<VirtualReaderPane<TChunk>> {
  if (chunks.length === 0) {
    return []
  }

  const panes: Array<VirtualReaderPane<TChunk>> = []
  let paneChunks: TChunk[] = []
  let paneStartIndex = 0
  let paneCharacterUnits = 0
  const charactersPerLine = getEstimatedCharactersPerLine(metrics)
  const maxCharacterUnitsPerPane = Math.max(charactersPerLine, maxLinesPerPane * charactersPerLine)

  chunks.forEach((chunk, chunkIndex) => {
    const chunkCharacterUnits = estimateChunkCharacterUnits(chunk, charactersPerLine)
    const shouldStartNextPane =
      paneChunks.length > 0 && paneCharacterUnits + chunkCharacterUnits > maxCharacterUnitsPerPane

    if (shouldStartNextPane) {
      panes.push(buildPane(paneChunks, paneStartIndex, chunkIndex - 1, paneCharacterUnits, charactersPerLine))
      paneChunks = []
      paneStartIndex = chunkIndex
      paneCharacterUnits = 0
    }

    paneChunks.push(chunk)
    paneCharacterUnits += chunkCharacterUnits
  })

  if (paneChunks.length > 0) {
    panes.push(buildPane(paneChunks, paneStartIndex, chunks.length - 1, paneCharacterUnits, charactersPerLine))
  }

  return panes
}

function buildPane<TChunk extends ReaderPaneChunk>(
  chunks: TChunk[],
  startChunkIndex: number,
  endChunkIndex: number,
  estimatedCharacterUnits: number,
  charactersPerLine: number,
): VirtualReaderPane<TChunk> {
  return {
    id: `reader-pane-${startChunkIndex}-${endChunkIndex}`,
    chunks,
    startChunkIndex,
    endChunkIndex,
    startWord: chunks[0]?.startWord ?? 0,
    endWord: chunks[chunks.length - 1]?.endWord ?? 0,
    estimatedLines: Math.max(1, Math.ceil(estimatedCharacterUnits / charactersPerLine)),
  }
}

function getEstimatedLinesPerPane(metrics: ReaderPaneMetrics, effectivePaneCount: number): number {
  const fontSize = Math.max(1, metrics.fontSize)
  const lineHeight = Math.max(1, metrics.lineHeight)
  const surfacePaddingBlock = metrics.surfacePaddingBlock ?? DEFAULT_SURFACE_PADDING_BLOCK
  const panePaddingBlock = metrics.panePaddingBlock ?? DEFAULT_PANE_PADDING_BLOCK
  const availableHeight = Math.max(0, metrics.containerHeight - surfacePaddingBlock - panePaddingBlock)
  const lineHeightPixels = fontSize * lineHeight

  if (metrics.containerHeight <= 0) {
    return Math.max(8, Math.floor(420 / lineHeightPixels))
  }

  return Math.max(4, Math.floor(availableHeight / lineHeightPixels) - (effectivePaneCount > 1 ? 1 : 0))
}

function estimateChunkCharacterUnits(chunk: ReaderPaneChunk, charactersPerLine: number): number {
  const paragraphBreakUnits = chunk.startsNewParagraph ? charactersPerLine : 0

  return paragraphBreakUnits + chunk.text.length + 1
}

function getEstimatedCharactersPerLine(metrics: ReaderPaneMetrics): number {
  const effectivePaneCount = getEffectiveReaderPaneCount(metrics)
  const gap = metrics.gap ?? DEFAULT_GAP
  const surfacePaddingInline = metrics.surfacePaddingInline ?? DEFAULT_SURFACE_PADDING_INLINE
  const panePaddingInline = metrics.panePaddingInline ?? DEFAULT_PANE_PADDING_INLINE
  const availableWidth = Math.max(0, metrics.containerWidth - surfacePaddingInline - gap * (effectivePaneCount - 1))
  const paneWidth = Math.max(160, availableWidth / effectivePaneCount - panePaddingInline)
  const characterWidth = Math.max(1, metrics.fontSize * AVERAGE_READER_CHARACTER_WIDTH_EM)

  return Math.max(18, Math.floor(paneWidth / characterWidth))
}

function clampPaneCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.min(4, Math.floor(value)))
}
