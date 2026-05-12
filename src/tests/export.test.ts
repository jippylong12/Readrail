import { describe, expect, it } from 'vitest'
import { exportProgressCsv, exportProgressJson, type ProgressExportInput } from '../lib/db/export'

type TestPageInput = Pick<
  ProgressExportInput['documentPages'][number],
  'chapterId' | 'id' | 'pageNumber' | 'sourcePageNumber' | 'text' | 'title' | 'wordCount'
> & Partial<ProgressExportInput['documentPages'][number]>

describe('progress export', () => {
  it('exports valid JSON backup data', () => {
    const parsed = JSON.parse(exportProgressJson(buildExportInput())) as {
      documents: unknown[]
      sessions: unknown[]
      documentChapters: unknown[]
      documentPages: unknown[]
    }

    expect(parsed.documents).toHaveLength(1)
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.documentChapters).toHaveLength(2)
    expect(parsed.documentPages).toHaveLength(3)
  })

  it('exports CSV headers with structured context columns', () => {
    const header = exportProgressCsv(buildExportInput({ sessions: [] })).split('\n')[0]

    expect(header).toContain('session_id,document_id,document_title,scope_type,scope_label,mode')
    expect(header).toContain('chapter_ids,chapter_titles,page_numbers,source_page_numbers,page_titles')
  })

  it('exports CSV rows with derived structured chapter and page ranges', () => {
    const rows = exportProgressCsv(buildExportInput()).split('\n')

    expect(rows[1]).toContain('session-1,doc-1,Structured book,document,,rail')
    expect(rows[1]).toContain('chapter-intro,Introduction,1;2,21;22,Opening;Second page')
  })

  it('exports explicit scoped session metadata when available', () => {
    const input = buildExportInput()
    const rows = exportProgressCsv(buildExportInput({
      sessions: [
        {
          ...input.sessions[0],
          scopeType: 'pages',
          scopeLabel: 'Introduction, page 2',
          chapterId: 'chapter-intro',
          chapterTitle: 'Introduction',
          pageIds: ['page-intro-2'],
          pageNumbers: [2],
          sourcePageNumbers: [22],
        },
      ],
    })).split('\n')

    expect(rows[1]).toContain('session-1,doc-1,Structured book,pages,"Introduction, page 2",rail')
    expect(rows[1]).toContain('chapter-intro,Introduction,2,22,Second page')
  })
})

function buildExportInput(overrides: Partial<ProgressExportInput> = {}): ProgressExportInput {
  const documents = [
    {
      id: 'doc-1',
      title: 'Structured book',
      sourceType: 'photo_ocr' as const,
      content: 'First page text.\n\n\f\n\nSecond page range text.\n\n\f\n\nAppendix page text.',
      wordCount: 10,
      estimatedPages: 3,
      language: 'en',
      structureVersion: 1,
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:00:00.000Z',
      archivedAt: null,
    },
  ]
  const documentChapters = [
    {
      id: 'chapter-intro',
      documentId: 'doc-1',
      title: 'Introduction',
      sortOrder: 0,
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:00:00.000Z',
    },
    {
      id: 'chapter-appendix',
      documentId: 'doc-1',
      title: 'Appendix',
      sortOrder: 1,
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:00:00.000Z',
    },
  ]
  const documentPages = [
    buildPage({
      id: 'page-intro-1',
      chapterId: 'chapter-intro',
      pageNumber: 1,
      sourcePageNumber: 21,
      title: 'Opening',
      text: 'First page text.',
      wordCount: 3,
    }),
    buildPage({
      id: 'page-intro-2',
      chapterId: 'chapter-intro',
      sortOrder: 1,
      pageNumber: 2,
      sourcePageNumber: 22,
      title: 'Second page',
      text: 'Second page range text.',
      wordCount: 4,
    }),
    buildPage({
      id: 'page-appendix-1',
      chapterId: 'chapter-appendix',
      pageNumber: 3,
      sourcePageNumber: 99,
      title: 'Appendix page',
      text: 'Appendix page text.',
      wordCount: 3,
    }),
  ]
  const sessions = [
    {
      id: 'session-1',
      documentId: 'doc-1',
      mode: 'rail' as const,
      targetWpm: 240,
      actualWpm: 220,
      adjustedWpm: 210,
      wordsRead: 5,
      durationSeconds: 90,
      startPosition: 2,
      endPosition: 7,
      pauseCount: 0,
      regressionCount: 0,
      comprehensionScore: 88,
      selfRating: null,
      notes: '',
      startedAt: '2026-05-11T12:05:00.000Z',
      endedAt: '2026-05-11T12:06:30.000Z',
    },
  ]

  return {
    documents,
    documentChapters,
    documentPages,
    sessions,
    ...overrides,
  }
}

function buildPage(overrides: TestPageInput): ProgressExportInput['documentPages'][number] {
  return {
    documentId: 'doc-1',
    sortOrder: 0,
    reviewStatus: 'reviewed' as const,
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: 'image' as const,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: '2026-05-11T12:00:00.000Z',
    updatedAt: '2026-05-11T12:00:00.000Z',
    ...overrides,
  }
}
