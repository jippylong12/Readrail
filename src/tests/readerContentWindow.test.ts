import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READER_WINDOW_ADVANCE_THRESHOLD,
  DEFAULT_READER_WINDOW_WORD_COUNT,
  buildReaderContentModel,
} from '../app/readerContentWindow'
import { countWords } from '../lib/text/wordCount'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

const timestamp = '2026-05-01T00:00:00.000Z'

function buildDocument(pages: Array<{ text: string }>): DocumentRecord {
  const content = pages.map((page) => page.text).join('\n\n\f\n\n')
  return {
    id: 'doc-1',
    title: 'Windowed reader',
    sourceType: 'photo_ocr',
    content,
    wordCount: countWords(content),
    estimatedPages: pages.length,
    language: 'en',
    structureVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  }
}

function buildChapter(id: string, title: string, sortOrder: number): DocumentChapterRecord {
  return {
    id,
    documentId: 'doc-1',
    title,
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function buildPage(
  id: string,
  chapterId: string,
  pageNumber: number,
  sortOrder: number,
  text: string,
  sourcePageNumber: number | null = pageNumber,
): DocumentPageRecord {
  return {
    id,
    documentId: 'doc-1',
    chapterId,
    sortOrder,
    pageNumber,
    sourcePageNumber,
    title: null,
    text,
    wordCount: countWords(text),
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: null,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function words(prefix: string, count: number, start = 0): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${start + index}`).join(' ')
}

describe('reader content windows', () => {
  it('returns default-size document windows and advances by the overlap threshold', () => {
    const chapter = buildChapter('chapter-1', 'All pages', 0)
    const pageTexts = [
      words('w', 400, 0),
      words('w', 400, 400),
      words('w', 505, 800),
    ]
    const document = buildDocument(pageTexts.map((text) => ({ text })))
    const pages = pageTexts.map((text, index) =>
      buildPage(`page-${index + 1}`, chapter.id, index + 1, index, text, index + 11),
    )
    const model = buildReaderContentModel(document, [chapter], pages, { scopeType: 'document' })

    expect(model.activeWindowWords).toBe(DEFAULT_READER_WINDOW_WORD_COUNT)
    expect(model.advanceThresholdWords).toBe(DEFAULT_READER_WINDOW_ADVANCE_THRESHOLD)
    expect(model.scopeLabel).toBe('Full document')
    expect(model.startWordOffset).toBe(0)
    expect(model.endWordOffset).toBe(1305)

    const firstWindow = model.getWindow()
    expect(firstWindow.startWordIndex).toBe(0)
    expect(firstWindow.endWordIndex).toBe(1000)
    expect(firstWindow.wordCount).toBe(1000)
    expect(firstWindow.pageIds).toEqual(['page-1', 'page-2', 'page-3'])
    expect(firstWindow.content.split(/\s+/).filter(Boolean)).toHaveLength(1000)
    expect(firstWindow.content).toContain('w0')
    expect(firstWindow.content).toContain('w999')
    expect(firstWindow.content).not.toContain('w1000')
    expect(firstWindow.isAtStart).toBe(true)
    expect(firstWindow.isAtEnd).toBe(false)
    expect(model.shouldAdvanceWindow(999, firstWindow)).toBe(false)
    expect(model.shouldAdvanceWindow(1000, firstWindow)).toBe(true)

    const nextWindow = model.getNextWindow(firstWindow)
    expect(nextWindow.startWordIndex).toBe(800)
    expect(nextWindow.endWordIndex).toBe(1305)
    expect(nextWindow.isAtEnd).toBe(true)
    expect(nextWindow.content).toContain('w800')

    const endWindow = model.getWindowForWord(1200)
    expect(endWindow.startWordIndex).toBe(800)
    expect(endWindow.endWordIndex).toBe(1305)
    expect(endWindow.pageIds).toEqual(['page-3'])
    expect(endWindow.content).toContain('w800')
    expect(endWindow.content).toContain('w1304')
    expect(endWindow.isAtEnd).toBe(true)
  })

  it('aligns automatic windows to source page starts when the active page fits in a window', () => {
    const chapter = buildChapter('chapter-1', 'All pages', 0)
    const pageTexts = [
      words('page1word', 420),
      words('page2word', 380),
      [
        'During that time she had fewer opportunities to obtain food.',
        words('page3middle', 170),
        'elephant societies are controlled by strong networks of cooperative females, while the self-centred males are pushed aside.',
        words('page3tail', 140),
      ].join(' '),
      words('page4word', 420),
    ]
    const document = buildDocument(pageTexts.map((text) => ({ text })))
    const pages = pageTexts.map((text, index) =>
      buildPage(`page-${index + 1}`, chapter.id, index + 1, index, text, index + 1),
    )
    const model = buildReaderContentModel(document, [chapter], pages, { scopeType: 'document' })
    const activeWordIndex = 1_000

    const activeWindow = model.getWindowForWord(activeWordIndex)

    expect(activeWindow.startWordIndex).toBe(800)
    expect(activeWindow.pageIds).toContain('page-3')
    expect(activeWindow.content).toContain('During that time she had fewer opportunities')
    expect(activeWindow.content).toContain('elephant societies are controlled by strong networks')
  })

  it('uses actual page text length instead of stale stored page word counts for windows', () => {
    const chapter = buildChapter('chapter-1', 'All pages', 0)
    const pageTexts = [
      words('page1word', 420),
      words('page2word', 380),
      [
        'During that time she had fewer opportunities to obtain food.',
        words('page3middle', 170),
        'elephant societies are controlled by strong networks of cooperative females, while the self-centred males are pushed aside.',
        words('page3tail', 140),
      ].join(' '),
      words('page4word', 420),
    ]
    const document = buildDocument(pageTexts.map((text) => ({ text })))
    const pages = pageTexts.map((text, index) =>
      buildPage(`page-${index + 1}`, chapter.id, index + 1, index, text, index + 1),
    )
    const pagesWithStaleCounts = pages.map((page) =>
      page.id === 'page-3' ? { ...page, wordCount: 6 } : page,
    )

    const model = buildReaderContentModel(document, [chapter], pagesWithStaleCounts, { scopeType: 'document' })
    const activeWindow = model.getWindowForWord(1_000)

    expect(model.wordCount).toBe(document.wordCount)
    expect(activeWindow.startWordIndex).toBe(800)
    expect(activeWindow.content).toContain('During that time she had fewer opportunities')
    expect(activeWindow.content).toContain('elephant societies are controlled by strong networks')
    expect(activeWindow.content).toContain('page3tail139')
  })

  it('preserves chapter metadata and document-level offsets inside chapter windows', () => {
    const intro = buildChapter('chapter-1', 'Intro', 0)
    const methods = buildChapter('chapter-2', 'Methods', 1)
    const pageTexts = [
      words('intro', 5),
      words('method', 7, 0),
      words('method', 7, 7),
    ]
    const document = buildDocument(pageTexts.map((text) => ({ text })))
    const pages = [
      buildPage('page-1', intro.id, 1, 0, pageTexts[0], 21),
      buildPage('page-2', methods.id, 2, 0, pageTexts[1], 22),
      buildPage('page-3', methods.id, 3, 1, pageTexts[2], 23),
    ]
    const model = buildReaderContentModel(
      document,
      [methods, intro],
      pages,
      { scopeType: 'chapter', chapterId: methods.id },
      { activeWindowWords: 6, advanceThresholdWords: 3 },
    )

    expect(model.scopeType).toBe('chapter')
    expect(model.scopeLabel).toBe('Methods')
    expect(model.chapterId).toBe(methods.id)
    expect(model.pageIds).toEqual(['page-2', 'page-3'])
    expect(model.startWordOffset).toBe(5)
    expect(model.endWordOffset).toBe(19)

    const firstWindow = model.getWindow()
    expect(firstWindow.startWordIndex).toBe(0)
    expect(firstWindow.documentStartWordIndex).toBe(5)
    expect(firstWindow.documentEndWordIndex).toBe(11)
    expect(firstWindow.pageIds).toEqual(['page-2'])
    expect(firstWindow.content).toBe('method0 method1 method2 method3 method4 method5')
    expect(firstWindow.isAtStart).toBe(true)
    expect(firstWindow.isAtEnd).toBe(false)

    const endWindow = model.getWindow(11)
    expect(endWindow.startWordIndex).toBe(11)
    expect(endWindow.endWordIndex).toBe(14)
    expect(endWindow.documentStartWordIndex).toBe(16)
    expect(endWindow.documentEndWordIndex).toBe(19)
    expect(endWindow.pageIds).toEqual(['page-3'])
    expect(endWindow.content).toBe('method11 method12 method13')
    expect(endWindow.isAtEnd).toBe(true)
  })

  it('materializes only bounded page-range text while retaining selected page metadata', () => {
    const chapter = buildChapter('chapter-1', 'Selected pages', 0)
    const pageTexts = [
      words('page1word', 5),
      words('page2word', 5),
      words('page3word', 5),
      words('page4word', 5),
    ]
    const document = buildDocument(pageTexts.map((text) => ({ text })))
    const pages = pageTexts.map((text, index) =>
      buildPage(`page-${index + 1}`, chapter.id, index + 1, index, text, index + 31),
    )
    const model = buildReaderContentModel(
      document,
      [chapter],
      pages,
      {
        scopeType: 'pages',
        chapterId: chapter.id,
        startPageNumber: 2,
        endPageNumber: 3,
      },
      { activeWindowWords: 4, advanceThresholdWords: 2 },
    )

    expect(model.scopeType).toBe('pages')
    expect(model.scopeLabel).toBe('Selected pages, pages 32-33')
    expect(model.pageIds).toEqual(['page-2', 'page-3'])
    expect(model.sourcePageNumbers).toEqual([32, 33])
    expect(model.startWordOffset).toBe(5)
    expect(model.endWordOffset).toBe(15)

    const crossPageWindow = model.getWindow(3)
    expect(crossPageWindow.startWordIndex).toBe(3)
    expect(crossPageWindow.endWordIndex).toBe(7)
    expect(crossPageWindow.documentStartWordIndex).toBe(8)
    expect(crossPageWindow.documentEndWordIndex).toBe(12)
    expect(crossPageWindow.pageIds).toEqual(['page-2', 'page-3'])
    expect(crossPageWindow.sourcePageNumbers).toEqual([32, 33])
    expect(crossPageWindow.content).toBe(
      `page2word3 page2word4\n\n\f\n\npage3word0 page3word1`,
    )
    expect(crossPageWindow.content).not.toContain('page1word')
    expect(crossPageWindow.content).not.toContain('page4word')

    const endWindow = model.getWindow(8)
    expect(endWindow.startWordIndex).toBe(8)
    expect(endWindow.endWordIndex).toBe(10)
    expect(endWindow.wordCount).toBe(2)
    expect(endWindow.pageIds).toEqual(['page-3'])
    expect(endWindow.content).toBe('page3word3 page3word4')
    expect(endWindow.isAtEnd).toBe(true)
  })
})
