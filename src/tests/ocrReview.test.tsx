// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrReview } from '../components/OcrReview'
import { useAppStore } from '../app/store'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { stripImageMetadata } from '../lib/files/imageMetadata'
import type { OcrResult } from '../lib/ai/geminiOcr'
import type { DocumentChapterRecord, DocumentRecord, OcrJob, OcrJobItem, OcrJobItemPage } from '../types/domain'

vi.mock('../lib/ai/geminiOcr', () => ({
  runGeminiOcrFromFiles: vi.fn(),
}))

vi.mock('../lib/files/imageMetadata', () => ({
  stripImageMetadata: vi.fn(async (file: File) => ({ file, stripped: false, warning: null })),
}))

const runGeminiOcrFromFilesMock = vi.mocked(runGeminiOcrFromFiles)
const stripImageMetadataMock = vi.mocked(stripImageMetadata)

const existingDocument: DocumentRecord = {
  id: 'document-1',
  title: 'Existing book',
  sourceType: 'paste',
  content: 'Existing text.',
  wordCount: 2,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-11T12:00:00.000Z',
  updatedAt: '2026-05-11T12:00:00.000Z',
  archivedAt: null,
}

const existingChapters: DocumentChapterRecord[] = [
  {
    id: 'chapter-1',
    documentId: existingDocument.id,
    title: 'Part One',
    sortOrder: 0,
    createdAt: existingDocument.createdAt,
    updatedAt: existingDocument.updatedAt,
  },
  {
    id: 'chapter-2',
    documentId: existingDocument.id,
    title: 'Part Two',
    sortOrder: 1,
    createdAt: existingDocument.createdAt,
    updatedAt: existingDocument.updatedAt,
  },
]

function createReviewJob(overrides: Partial<OcrJob> = {}): OcrJob {
  const now = '2026-05-11T12:00:00.000Z'
  return {
    id: 'review-all-job',
    documentId: null,
    targetChapterId: null,
    status: 'review',
    concurrentItemLimit: 10,
    modelId: 'gemini-3.1-flash-lite',
    inputFileCount: 1,
    promptVersion: 'structured-import-v1',
    warnings: [],
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...overrides,
  }
}

function createReviewPage(overrides: Partial<OcrJobItemPage> = {}): OcrJobItemPage {
  return {
    pageNumber: 1,
    sourcePageNumber: 1,
    title: null,
    text: 'Review page text.',
    reviewStatus: 'unreviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileName: 'review-page.png',
    sourceKind: 'image',
    ...overrides,
  }
}

function createReviewItem(overrides: Partial<OcrJobItem> = {}): OcrJobItem {
  const now = '2026-05-11T12:00:00.000Z'
  return {
    id: 'review-all-item',
    jobId: 'review-all-job',
    orderIndex: 0,
    sourceFileName: 'review-page.png',
    sourceFileType: 'image/png',
    sourceFileSize: 5,
    sourceFileLastModified: 1,
    sourcePageNumber: 1,
    title: null,
    status: 'review',
    ocrText: 'Review page text.',
    pages: [createReviewPage()],
    warnings: [],
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

afterEach(() => {
  runGeminiOcrFromFilesMock.mockReset()
  stripImageMetadataMock.mockReset()
  stripImageMetadataMock.mockImplementation(async (file) => ({ file, stripped: false, warning: null }))
  useAppStore.setState({
    ocrJobs: [],
    ocrJobItems: [],
    ocrRuntimeJobs: {},
    settings: {
      ...useAppStore.getState().settings,
      ocr: {
        ...useAppStore.getState().settings.ocr,
        concurrentItemLimit: 10,
      },
    },
  })
  vi.restoreAllMocks()
  cleanup()
})

describe('OcrReview', () => {
  it('keeps OCR disabled until a Gemini key and file are available', () => {
    render(
      <OcrReview
        documents={[]}
        hasKey={false}
        loadApiKey={vi.fn()}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'OCR disabled until files are selected' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Add a Gemini key in Settings to enable OCR')).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toHaveProperty('disabled', true)
    expect(screen.getByText('Key missing')).toBeTruthy()
  })

  it('opens the active OCR job cost drilldown from review status', async () => {
    const user = userEvent.setup()
    const onOpenJobCosts = vi.fn()
    const now = new Date().toISOString()
    const job: OcrJob = {
      id: 'job-costs',
      documentId: null,
      targetChapterId: null,
      status: 'review',
      concurrentItemLimit: 10,
      modelId: 'gemini-3.1-flash-lite',
      inputFileCount: 1,
      promptVersion: 'v1',
      warnings: [],
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    }
    const item: OcrJobItem = {
      id: 'item-costs',
      jobId: job.id,
      orderIndex: 0,
      sourceFileName: 'scan.png',
      sourceFileType: 'image/png',
      sourceFileSize: 5,
      sourceFileLastModified: 1,
      sourcePageNumber: 1,
      title: null,
      status: 'review',
      ocrText: 'Ready page.',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: 1,
          title: null,
          text: 'Ready page.',
          reviewStatus: 'reviewed',
          ocrConfidence: null,
          ocrNotes: null,
          uncertainSpans: [],
          sourceFileName: 'scan.png',
          sourceKind: 'image',
        },
      ],
      warnings: [],
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    }
    useAppStore.setState({ ocrJobs: [job], ocrJobItems: [item], ocrRuntimeJobs: {} })

    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        onOpenJobCosts={onOpenJobCosts}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'View job costs' }))

    expect(onOpenJobCosts).toHaveBeenCalledWith('job-costs')
  })

  it('reviews all pending OCR pages without changing failed, skipped, queued, or running items', async () => {
    const user = userEvent.setup()
    const job = createReviewJob({ id: 'mixed-review-job', inputFileCount: 5 })
    const items: OcrJobItem[] = [
      createReviewItem({
        id: 'mixed-ready',
        jobId: job.id,
        orderIndex: 0,
        pages: [
          createReviewPage({ pageNumber: 1, reviewStatus: 'unreviewed', text: 'Unreviewed page.' }),
          createReviewPage({ pageNumber: 2, sourcePageNumber: 2, reviewStatus: 'needs_attention', text: 'Attention page.' }),
          createReviewPage({ pageNumber: 3, sourcePageNumber: 3, reviewStatus: 'skipped', text: 'Skipped page.' }),
        ],
      }),
      createReviewItem({ id: 'mixed-failed', jobId: job.id, orderIndex: 1, status: 'failed', pages: [], failureReason: 'Unreadable.' }),
      createReviewItem({ id: 'mixed-skipped', jobId: job.id, orderIndex: 2, status: 'skipped', pages: [] }),
      createReviewItem({ id: 'mixed-queued', jobId: job.id, orderIndex: 3, status: 'queued', pages: [] }),
      createReviewItem({ id: 'mixed-running', jobId: job.id, orderIndex: 4, status: 'running', pages: [] }),
    ]
    useAppStore.setState({ ocrJobs: [job], ocrJobItems: items, ocrRuntimeJobs: {} })

    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByText('Pending 2')).toBeTruthy()
    expect(screen.getByText('Needs attention 2')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Accept all' }))

    expect(screen.getByText('Pending 2')).toBeTruthy()
    expect(screen.getByText('Approved 2')).toBeTruthy()
    expect(screen.getByText('Needs attention 0')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull()
    expect(
      useAppStore
        .getState()
        .ocrJobItems.filter((item) => item.jobId === job.id)
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((item) => ({
          id: item.id,
          status: item.status,
          pageStatuses: item.pages.map((page) => page.reviewStatus),
        })),
    ).toEqual([
      { id: 'mixed-ready', status: 'review', pageStatuses: ['reviewed', 'reviewed', 'skipped'] },
      { id: 'mixed-failed', status: 'failed', pageStatuses: [] },
      { id: 'mixed-skipped', status: 'skipped', pageStatuses: [] },
      { id: 'mixed-queued', status: 'queued', pageStatuses: [] },
      { id: 'mixed-running', status: 'running', pageStatuses: [] },
    ])
  })

  it('enables saving immediately after Review All approves the remaining reviewable pages', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    const job = createReviewJob()
    useAppStore.setState({
      ocrJobs: [job],
      ocrJobItems: [
        createReviewItem({
          jobId: job.id,
          pages: [
            createReviewPage({ pageNumber: 1, reviewStatus: 'unreviewed', text: 'First page.' }),
            createReviewPage({ pageNumber: 2, sourcePageNumber: 2, reviewStatus: 'needs_attention', text: 'Second page.' }),
          ],
        }),
      ],
      ocrRuntimeJobs: {},
    })

    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'Accept all' }))

    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', false)
    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))

    expect(onCreateDocument).toHaveBeenCalledWith('review-page', [
      expect.objectContaining({ pageNumber: 1, text: 'First page.', reviewStatus: 'reviewed' }),
      expect.objectContaining({ pageNumber: 2, text: 'Second page.', reviewStatus: 'reviewed' }),
    ])
  })

  it('reviews OCR output as editable page items and saves a new structured document', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    const loadApiKey = vi.fn().mockResolvedValue('browser-key')
    const promptSpy = vi.spyOn(window, 'prompt')
    runGeminiOcrFromFilesMock.mockResolvedValue({
      titleGuess: 'OCR Title',
      pages: [
        {
          pageNumber: 4,
          sourcePageNumber: null,
          text: 'First OCR page',
          confidence: 0.94,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
        {
          pageNumber: 5,
          sourcePageNumber: null,
          text: 'Second [?unclear] page',
          confidence: 0.62,
          notes: 'Low light',
          sourceFileName: 'scan-5.png',
          uncertainSpans: [
            {
              text: '[?unclear]',
              startIndex: null,
              endIndex: null,
              confidence: null,
              note: null,
            },
          ],
        },
      ],
      warnings: ['Cleaner pass removed a repeated header.'],
    })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={loadApiKey}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()
    await user.upload(input!, new File(['image'], 'scan-4.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Process 1 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('OCR Title')).toBeTruthy())
    expect(loadApiKey).toHaveBeenCalledTimes(1)
    expect(promptSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Review 1 of 2')).toBeTruthy()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Page 4' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Approved 1')).toBeTruthy()
    expect(screen.getByText('Needs attention 1')).toBeTruthy()
    expect(screen.getAllByText('Cleaner pass removed a repeated header.').length).toBeGreaterThan(0)

    const pageTextarea = screen.getByLabelText('Page text')
    expect(pageTextarea).toHaveProperty('className', expect.stringContaining('ocr-page-textarea'))
    await user.clear(pageTextarea)
    await user.type(pageTextarea, 'Edited first OCR page')
    await user.type(screen.getByLabelText('Page title (optional)'), 'Chapter opener')
    await user.type(screen.getByLabelText('Notes'), 'Reviewed cleanly')
    const sourcePageInput = screen.getByLabelText('Source page number')
    await user.clear(sourcePageInput)
    await user.type(sourcePageInput, '156')
    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Review 2 of 2')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.getByText('62% confidence')).toBeTruthy()
    expect(screen.getByText('1 uncertain span(s)')).toBeTruthy()
    expect(screen.getByDisplayValue('Low light')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Review status'), 'reviewed')
    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))

    expect(onCreateDocument).toHaveBeenCalledWith('OCR Title', [
      expect.objectContaining({
        pageNumber: 1,
        sourcePageNumber: 156,
        title: 'Chapter opener',
        text: 'Edited first OCR page',
        reviewStatus: 'reviewed',
        ocrNotes: 'Reviewed cleanly',
        sourceFileName: 'scan-4.png',
        sourceKind: 'image',
      }),
      expect.objectContaining({
        pageNumber: 2,
        sourcePageNumber: 5,
        text: 'Second [?unclear] page',
        reviewStatus: 'reviewed',
        ocrNotes: 'Low light',
        sourceFileName: 'scan-5.png',
      }),
    ])
  })

  it('skips focused OCR pages and renumbers the final save payload in review order', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    runGeminiOcrFromFilesMock.mockResolvedValue({
      titleGuess: 'Skip middle page',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: 11,
          text: 'First kept page.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
        {
          pageNumber: 2,
          sourcePageNumber: 12,
          text: 'Skipped ad page.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
        {
          pageNumber: 3,
          sourcePageNumber: 13,
          text: 'Final kept page.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['image'], 'three-pages.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Process 1 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('First kept page.')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByDisplayValue('Skipped ad page.')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Review status'), 'skipped')
    expect(screen.getByText('Skipped 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))

    expect(onCreateDocument).toHaveBeenCalledWith('Skip middle page', [
      expect.objectContaining({ pageNumber: 1, sourcePageNumber: 11, text: 'First kept page.' }),
      expect.objectContaining({ pageNumber: 2, sourcePageNumber: 13, text: 'Final kept page.' }),
    ])
  })

  it('shows stage progress while OCR cleanup and formatting run', async () => {
    const user = userEvent.setup()
    let resolveOcr!: (value: OcrResult) => void
    const ocrPromise = new Promise<OcrResult>((resolve) => {
      resolveOcr = resolve
    })
    runGeminiOcrFromFilesMock.mockImplementation(async (_apiKey, _files, options) => {
      options?.onProgress?.({ stage: 'ocr', status: 'running', message: 'Reading scans with Gemini OCR.' })
      options?.onProgress?.({ stage: 'ocr', status: 'done', message: 'OCR text extracted.' })
      options?.onProgress?.({
        stage: 'cleaner',
        status: 'running',
        message: 'Removing page numbers, headers, footers, and scan artifacts.',
      })
      return ocrPromise
    })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['image'], 'scan.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Process 1 page(s)' }))

    await waitFor(() => expect(screen.getByText('0 of 1 complete · 1 running · 0 queued')).toBeTruthy())
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33')
    expect(screen.getByText('Cleaner')).toBeTruthy()
    expect(screen.getByText('Removing page numbers, headers, footers, and scan artifacts.')).toBeTruthy()

    resolveOcr({
      titleGuess: 'Finished scan',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Finished page',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })

    await waitFor(() => expect(screen.getByText('Ready for review.')).toBeTruthy())
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  it('limits staged uploads to 25 files before processing', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    const files = Array.from(
      { length: 26 },
      (_, index) => new File(['image'], `page-${index + 1}.png`, { type: 'image/png' }),
    )
    await user.upload(input!, files)

    expect(screen.getByText('25 file(s) selected')).toBeTruthy()
    expect(screen.getByText('Only the first 25 files will be processed.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Process 25 page(s)' })).toBeTruthy()
  })

  it('sorts staged OCR files by numeric filename by default', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'IMG_00002.png', { type: 'image/png', lastModified: 2 }),
      new File(['image'], 'IMG_00001.png', { type: 'image/png', lastModified: 1 }),
    ])

    expect(screen.getByLabelText('Source page for IMG_00001.png')).toHaveProperty('value', '1')
    expect(screen.getByLabelText('Source page for IMG_00002.png')).toHaveProperty('value', '2')
  })

  it('resorts staged OCR files and renumbers from the lowest source page', async () => {
    const user = userEvent.setup()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Sorted pages',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Newest image text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockResolvedValueOnce({
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Oldest image text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'IMG_00001.png', { type: 'image/png', lastModified: 1 }),
      new File(['image'], 'IMG_00002.png', { type: 'image/png', lastModified: 2 }),
    ])
    await user.clear(screen.getByLabelText('Source page for IMG_00001.png'))
    await user.type(screen.getByLabelText('Source page for IMG_00001.png'), '162')
    await user.clear(screen.getByLabelText('Source page for IMG_00002.png'))
    await user.type(screen.getByLabelText('Source page for IMG_00002.png'), '161')

    await user.click(screen.getByRole('button', { name: 'Sort OCR files' }))
    await user.click(screen.getByRole('menuitem', { name: 'Modified newest first' }))

    expect(screen.getByLabelText('Source page for IMG_00002.png')).toHaveProperty('value', '161')
    expect(screen.getByLabelText('Source page for IMG_00001.png')).toHaveProperty('value', '162')

    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))
    await waitFor(() => expect(screen.getByDisplayValue('Sorted pages')).toBeTruthy())

    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual([
      'IMG_00002.png',
      'IMG_00001.png',
    ])
  })

  it('auto-fills staged OCR source pages from a chosen starting page', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'IMG_00001.png', { type: 'image/png' }),
      new File(['image'], 'IMG_00002.png', { type: 'image/png' }),
      new File(['image'], 'IMG_00003.png', { type: 'image/png' }),
    ])

    await user.clear(screen.getByLabelText('Starting source page'))
    await user.type(screen.getByLabelText('Starting source page'), '163')
    fireEvent.blur(screen.getByLabelText('Starting source page'))

    expect(screen.getByLabelText('Source page for IMG_00001.png')).toHaveProperty('value', '163')
    expect(screen.getByLabelText('Source page for IMG_00002.png')).toHaveProperty('value', '164')
    expect(screen.getByLabelText('Source page for IMG_00003.png')).toHaveProperty('value', '165')
  })

  it('processes files in the user-defined order with staged source metadata', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Ordered pages',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Second file text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockResolvedValueOnce({
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'First file text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'page-a.png', { type: 'image/png' }),
      new File(['image'], 'page-b.png', { type: 'image/png' }),
    ])
    const firstSourcePage = screen.getByLabelText('Source page for page-a.png')
    await user.clear(firstSourcePage)
    await user.type(firstSourcePage, '10')
    await user.click(screen.getByRole('button', { name: 'Move page-a.png down' }))
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('Ordered pages')).toBeTruthy())
    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual(['page-b.png', 'page-a.png'])

    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))
    expect(onCreateDocument).toHaveBeenCalledWith('Ordered pages', [
      expect.objectContaining({
        sourceFileName: 'page-b.png',
        sourcePageNumber: 2,
        text: 'Second file text.',
      }),
      expect.objectContaining({
        sourceFileName: 'page-a.png',
        sourcePageNumber: 3,
        text: 'First file text.',
      }),
    ])
  })

  it('allows reviewing completed items while later OCR items keep running', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    let resolveSecondOcr!: (value: OcrResult) => void
    const secondOcrPromise = new Promise<OcrResult>((resolve) => {
      resolveSecondOcr = resolve
    })
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Background import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'First item ready.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockImplementationOnce(async (_apiKey, _files, options) => {
        options?.onProgress?.({ stage: 'ocr', status: 'running', message: 'Reading scans with Gemini OCR.' })
        return secondOcrPromise
      })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['first'], 'first-page.png', { type: 'image/png' }),
      new File(['second'], 'second-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('First item ready.')).toBeTruthy())
    expect(screen.getByText('1 of 2 complete · 1 running · 0 queued')).toBeTruthy()
    expect(screen.getByText('Reading scans with Gemini OCR.')).toBeTruthy()
    expect(screen.getByText('Pending 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', true)

    await user.clear(screen.getByDisplayValue('First item ready.'))
    await user.type(screen.getByLabelText('Page text'), 'Edited while second runs.')

    resolveSecondOcr({
      titleGuess: null,
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Second item finished.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })

    await waitFor(() => expect(screen.getByText('Approved 2')).toBeTruthy())
    expect(screen.getByDisplayValue('Edited while second runs.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByDisplayValue('Second item finished.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', false)

    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))
    expect(onCreateDocument).toHaveBeenCalledWith('Background import', [
      expect.objectContaining({ sourceFileName: 'first-page.png', text: 'Edited while second runs.' }),
      expect.objectContaining({ sourceFileName: 'second-page.png', text: 'Second item finished.' }),
    ])
  })

  it('runs concurrent OCR items out of completion order while keeping review order stable', async () => {
    let resolveFirst!: (value: OcrResult) => void
    let resolveSecond!: (value: OcrResult) => void
    let resolveThird!: (value: OcrResult) => void
    const firstPromise = new Promise<OcrResult>((resolve) => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<OcrResult>((resolve) => {
      resolveSecond = resolve
    })
    const thirdPromise = new Promise<OcrResult>((resolve) => {
      resolveThird = resolve
    })
    runGeminiOcrFromFilesMock.mockImplementation(async (_apiKey, files, options) => {
      options?.onProgress?.({ stage: 'ocr', status: 'running', message: 'Reading scans with Gemini OCR.' })
      const fileName = files[0]?.name
      if (fileName === 'first.png') {
        return firstPromise
      }
      if (fileName === 'second.png') {
        return secondPromise
      }
      return thirdPromise
    })

    const jobId = useAppStore.getState().startOcrJob({
      files: [
        { file: new File(['first'], 'first.png', { type: 'image/png' }), title: '', sourcePageNumber: 1 },
        { file: new File(['second'], 'second.png', { type: 'image/png' }), title: '', sourcePageNumber: 2 },
        { file: new File(['third'], 'third.png', { type: 'image/png' }), title: '', sourcePageNumber: 3 },
      ],
      documentId: null,
      targetChapterId: null,
      loadApiKey: vi.fn().mockResolvedValue('browser-key'),
      stripImageMetadataBeforeOcr: false,
      concurrentItemLimit: 10,
    })!

    await waitFor(() => expect(runGeminiOcrFromFilesMock).toHaveBeenCalledTimes(3))
    expect(useAppStore.getState().ocrRuntimeJobs[jobId]?.progressMessage).toBe('0 of 3 complete · 3 running · 0 queued')
    expect(Object.values(useAppStore.getState().ocrRuntimeJobs[jobId]?.itemProgressById ?? {}).map((progress) => progress.message)).toEqual([
      'Reading scans with Gemini OCR.',
      'Reading scans with Gemini OCR.',
      'Reading scans with Gemini OCR.',
    ])

    resolveThird({
      titleGuess: 'Concurrent import',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Third finished first.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })
    await waitFor(() =>
      expect(useAppStore.getState().ocrJobItems.find((item) => item.sourceFileName === 'third.png')?.status).toBe('review'),
    )

    resolveFirst({
      titleGuess: null,
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'First finished second.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })
    resolveSecond({
      titleGuess: null,
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Second finished last.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })

    await waitFor(() => expect(useAppStore.getState().ocrJobs.find((job) => job.id === jobId)?.status).toBe('review'))
    const items = useAppStore.getState().ocrJobItems.filter((item) => item.jobId === jobId)

    expect(items.map((item) => item.sourceFileName)).toEqual(['first.png', 'second.png', 'third.png'])
    expect(items.map((item) => item.pages[0]?.text)).toEqual([
      'First finished second.',
      'Second finished last.',
      'Third finished first.',
    ])
    expect(useAppStore.getState().ocrJobs.find((job) => job.id === jobId)?.concurrentItemLimit).toBe(10)
  })

  it('clamps OCR concurrency settings to the supported queue range', () => {
    useAppStore.getState().updateSettings({
      ocr: {
        ...useAppStore.getState().settings.ocr,
        concurrentItemLimit: 50,
      },
    })
    expect(useAppStore.getState().settings.ocr.concurrentItemLimit).toBe(25)

    useAppStore.getState().updateSettings({
      ocr: {
        ...useAppStore.getState().settings.ocr,
        concurrentItemLimit: 0,
      },
    })
    expect(useAppStore.getState().settings.ocr.concurrentItemLimit).toBe(1)
  })

  it('renders concurrent OCR review with mixed running, review, and failed items', () => {
    const job = createReviewJob({
      id: 'concurrent-mixed-job',
      inputFileCount: 3,
      status: 'running',
      concurrentItemLimit: 10,
      completedAt: null,
    })
    const items: OcrJobItem[] = [
      createReviewItem({
        id: 'concurrent-ready',
        jobId: job.id,
        orderIndex: 0,
        sourceFileName: '01-ready.png',
        pages: [createReviewPage({ text: 'Ready in first position.', reviewStatus: 'reviewed', sourceFileName: '01-ready.png' })],
      }),
      createReviewItem({
        id: 'concurrent-running',
        jobId: job.id,
        orderIndex: 1,
        sourceFileName: '02-running.png',
        status: 'running',
        pages: [],
        ocrText: null,
      }),
      createReviewItem({
        id: 'concurrent-failed',
        jobId: job.id,
        orderIndex: 2,
        sourceFileName: '03-failed.png',
        status: 'failed',
        pages: [],
        ocrText: null,
        failureReason: 'Rate limit reached.',
      }),
    ]
    useAppStore.setState({
      ocrJobs: [job],
      ocrJobItems: items,
      ocrRuntimeJobs: {
        [job.id]: {
          jobId: job.id,
          filesByItemId: {},
          progressMessage: '2 of 3 complete · 1 running · 0 queued',
          progressState: { ocr: 'running', cleaner: 'pending', formatter: 'pending' },
          itemProgressById: {
            'concurrent-ready': {
              itemId: 'concurrent-ready',
              progressState: { ocr: 'done', cleaner: 'done', formatter: 'done' },
              message: 'Ready for review.',
              startedAt: '2026-05-11T12:00:00.000Z',
              completedAt: '2026-05-11T12:00:05.000Z',
              failureMessage: null,
            },
            'concurrent-running': {
              itemId: 'concurrent-running',
              progressState: { ocr: 'done', cleaner: 'running', formatter: 'pending' },
              message: 'Removing page numbers, headers, footers, and scan artifacts.',
              startedAt: '2026-05-11T12:00:01.000Z',
              completedAt: null,
              failureMessage: null,
            },
            'concurrent-failed': {
              itemId: 'concurrent-failed',
              progressState: { ocr: 'failed', cleaner: 'pending', formatter: 'pending' },
              message: 'Rate limit reached.',
              startedAt: '2026-05-11T12:00:02.000Z',
              completedAt: '2026-05-11T12:00:03.000Z',
              failureMessage: 'Rate limit reached.',
            },
          },
          titleGuess: null,
          documentTitle: '',
          error: null,
        },
      },
    })

    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByText('2 of 3 complete · 1 running · 0 queued')).toBeTruthy()
    expect(screen.getByText('02-running.png')).toBeTruthy()
    expect(screen.getByText('Cleaner')).toBeTruthy()
    expect(screen.getByText('Removing page numbers, headers, footers, and scan artifacts.')).toBeTruthy()
    expect(screen.getByText('Approved 1')).toBeTruthy()
    expect(screen.getByText('Pending 1')).toBeTruthy()
    expect(screen.getByText('Failed 1')).toBeTruthy()
    expect(screen.getByText('Ready in first position.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', true)
  })

  it('keeps active OCR progress and review state after the route unmounts and returns', async () => {
    const user = userEvent.setup()
    let resolveSecondOcr!: (value: OcrResult) => void
    const secondOcrPromise = new Promise<OcrResult>((resolve) => {
      resolveSecondOcr = resolve
    })
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Route safe import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'First route-safe page.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockImplementationOnce(async (_apiKey, _files, options) => {
        options?.onProgress?.({ stage: 'ocr', status: 'running', message: 'Reading scans with Gemini OCR.' })
        return secondOcrPromise
      })

    const firstRender = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )
    const input = firstRender.container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['first'], 'route-first.png', { type: 'image/png' }),
      new File(['second'], 'route-second.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('First route-safe page.')).toBeTruthy())
    expect(screen.getByText('1 of 2 complete · 1 running · 0 queued')).toBeTruthy()

    cleanup()
    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByDisplayValue('First route-safe page.')).toBeTruthy()
    expect(screen.getByText('Pending 1')).toBeTruthy()
    expect(screen.getByText('1 of 2 complete · 1 running · 0 queued')).toBeTruthy()

    resolveSecondOcr({
      titleGuess: null,
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Second route-safe page.',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })

    await waitFor(() => expect(screen.getByText('Approved 2')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByDisplayValue('Second route-safe page.')).toBeTruthy()
  })

  it('surfaces failed OCR items after leaving and returning to the route', async () => {
    const user = userEvent.setup()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Recover failed import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Recovered route page.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('Route-safe OCR failure.'))

    const firstRender = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )
    const input = firstRender.container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['good'], 'recover-good.png', { type: 'image/png' }),
      new File(['bad'], 'recover-bad.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Failed 1')).toBeTruthy())
    cleanup()
    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByDisplayValue('Recovered route page.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Route-safe OCR failure.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeTruthy()
  })

  it('recovers interrupted persisted OCR jobs as failed review items on startup', async () => {
    const now = '2026-05-11T12:00:00.000Z'
    const job: OcrJob = {
      id: 'interrupted-job',
      documentId: null,
      targetChapterId: null,
      status: 'running',
      concurrentItemLimit: 10,
      modelId: 'gemini-3.1-flash-lite',
      inputFileCount: 2,
      promptVersion: 'structured-import-v1',
      warnings: [],
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
    const items: OcrJobItem[] = [
      {
        id: 'interrupted-ready',
        jobId: job.id,
        orderIndex: 0,
        sourceFileName: 'ready.png',
        sourceFileType: 'image/png',
        sourceFileSize: 5,
        sourceFileLastModified: 1,
        sourcePageNumber: 1,
        title: null,
        status: 'review',
        ocrText: 'Already ready.',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: 1,
            title: null,
            text: 'Already ready.',
            reviewStatus: 'reviewed',
            ocrConfidence: null,
            ocrNotes: null,
            uncertainSpans: [],
            sourceFileName: 'ready.png',
            sourceKind: 'image',
          },
        ],
        warnings: [],
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'interrupted-running',
        jobId: job.id,
        orderIndex: 1,
        sourceFileName: 'running.png',
        sourceFileType: 'image/png',
        sourceFileSize: 5,
        sourceFileLastModified: 1,
        sourcePageNumber: 2,
        title: null,
        status: 'running',
        ocrText: null,
        pages: [],
        warnings: [],
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      },
    ]
    useAppStore.setState({ ocrJobs: [job], ocrJobItems: items, ocrRuntimeJobs: {} })

    useAppStore.getState().recoverInterruptedOcrJobs()
    render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByText('Failed 1')).toBeTruthy()
    expect(screen.getByDisplayValue('Already ready.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText(/OCR was interrupted while the app was closed/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeTruthy()
  })

  it('strips supported image metadata before OCR when enabled', async () => {
    const user = userEvent.setup()
    const strippedFile = new File(['stripped'], 'scan.jpg', { type: 'image/jpeg' })
    stripImageMetadataMock.mockResolvedValue({
      file: strippedFile,
      stripped: true,
      warning: null,
    })
    runGeminiOcrFromFilesMock.mockResolvedValue({
      titleGuess: 'Metadata safe scan',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text: 'Metadata stripped page',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['original'], 'scan.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: 'Process 1 page(s)' }))

    await waitFor(() => expect(screen.getByDisplayValue('Metadata safe scan')).toBeTruthy())
    expect(stripImageMetadataMock.mock.calls[0][0]).toMatchObject({ name: 'scan.jpg' })
    expect(runGeminiOcrFromFilesMock.mock.calls[0][1]).toEqual([strippedFile])
  })

  it('keeps successful OCR items when another file fails and allows skipping the failed item', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Partial import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Successful page text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('Gemini could not read the scan.'))
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['good'], 'good-page.png', { type: 'image/png' }),
      new File(['bad'], 'z-bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Successful page text.')).toBeTruthy())
    expect(screen.getByText('Failed 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Gemini could not read the scan.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create document from pages' })).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))

    expect(onCreateDocument).toHaveBeenCalledWith('Partial import', [
      expect.objectContaining({
        sourceFileName: 'good-page.png',
        sourcePageNumber: 1,
        text: 'Successful page text.',
      }),
    ])
    const savedJob = useAppStore.getState().ocrJobs[0]
    expect(savedJob).toMatchObject({ status: 'saved', inputFileCount: 2 })
    expect(
      useAppStore
        .getState()
        .ocrJobItems.filter((item) => item.jobId === savedJob.id)
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((item) => item.status),
    ).toEqual(['review', 'skipped'])
  })

  it('retries only the failed OCR item without losing successful pages', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Retry import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Already successful.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('Temporary OCR failure.'))
      .mockResolvedValueOnce({
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Recovered page.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['good'], 'good-page.png', { type: 'image/png' }),
      new File(['bad'], 'z-bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Failed 1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Temporary OCR failure.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Approved 2')).toBeTruthy())
    expect(screen.getByDisplayValue('Recovered page.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByDisplayValue('Already successful.')).toBeTruthy()
    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual([
      'good-page.png',
      'z-bad-page.png',
      'z-bad-page.png',
    ])

    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))
    expect(onCreateDocument).toHaveBeenCalledWith('Retry import', [
      expect.objectContaining({ sourceFileName: 'good-page.png', text: 'Already successful.' }),
      expect.objectContaining({ sourceFileName: 'z-bad-page.png', text: 'Recovered page.' }),
    ])
  })

  it('replaces only a failed OCR item and keeps successful item state', async () => {
    const user = userEvent.setup()
    const onCreateDocument = vi.fn()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Replace import',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Kept page text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error('Unreadable original.'))
      .mockResolvedValueOnce({
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Replacement page text.',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
    const { container } = render(
      <OcrReview
        documents={[]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={vi.fn()}
        onCreateDocument={onCreateDocument}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['good'], 'good-page.png', { type: 'image/png' }),
      new File(['bad'], 'z-bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Failed 1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Unreadable original.').length).toBeGreaterThan(0)
    await user.upload(
      screen.getByLabelText('Replacement file for z-bad-page.png'),
      new File(['replacement'], 'replacement-page.png', { type: 'image/png' }),
    )

    await waitFor(() => expect(screen.getByDisplayValue('Replacement page text.')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByDisplayValue('Kept page text.')).toBeTruthy()
    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual([
      'good-page.png',
      'z-bad-page.png',
      'replacement-page.png',
    ])

    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))
    expect(onCreateDocument).toHaveBeenCalledWith('Replace import', [
      expect.objectContaining({ sourceFileName: 'good-page.png', text: 'Kept page text.' }),
      expect.objectContaining({ sourceFileName: 'replacement-page.png', text: 'Replacement page text.' }),
    ])
  })

  it('appends reviewed OCR pages to an existing document', async () => {
    const user = userEvent.setup()
    const onAppendPages = vi.fn()
    const loadApiKey = vi.fn().mockResolvedValue('browser-key')
    runGeminiOcrFromFilesMock.mockResolvedValue({
      titleGuess: 'Append scan',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: 156,
          text: 'Appended page text',
          confidence: null,
          notes: null,
          sourceFileName: null,
          uncertainSpans: [],
        },
      ],
      warnings: [],
    })
    const { container } = render(
      <OcrReview
        documents={[existingDocument]}
        hasKey
        loadApiKey={loadApiKey}
        onAppendPages={onAppendPages}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['pdf'], 'append.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Process 1 page(s)' }))

    await waitFor(() => expect(screen.getByLabelText('Append to')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Append pages' }))

    expect(onAppendPages).toHaveBeenCalledWith(
      'document-1',
      [
        expect.objectContaining({
          text: 'Appended page text',
          sourcePageNumber: 156,
          sourceFileName: 'append.pdf',
          sourceKind: 'pdf',
        }),
      ],
      null,
    )
  })

  it('shows the target chapter when adding pages from a document route', async () => {
    const user = userEvent.setup()
    const onAppendPages = vi.fn()
    runGeminiOcrFromFilesMock
      .mockResolvedValueOnce({
        titleGuess: 'Chapter append',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Chapter target page',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
      .mockResolvedValueOnce({
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Next chapter target page',
            confidence: null,
            notes: null,
            sourceFileName: null,
            uncertainSpans: [],
          },
        ],
        warnings: [],
      })
    const { container } = render(
      <OcrReview
        appendTargetChapterId="chapter-1"
        appendTargetDocumentId="document-1"
        appendStartSourcePageNumber={157}
        documentChapters={existingChapters}
        documents={[existingDocument]}
        hasKey
        loadApiKey={vi.fn().mockResolvedValue('browser-key')}
        onAppendPages={onAppendPages}
        onCreateDocument={vi.fn()}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    expect(screen.getByText('Destination')).toBeTruthy()
    expect(screen.getByText('Existing book')).toBeTruthy()
    expect(screen.getByText('New pages will be added to Part One.')).toBeTruthy()
    expect(screen.queryByLabelText('Add to chapter')).toBeNull()

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'chapter-page.png', { type: 'image/png' }),
      new File(['image'], 'chapter-page-2.png', { type: 'image/png' }),
    ])
    expect(screen.getByLabelText('Source page for chapter-page-2.png')).toHaveProperty('value', '157')
    expect(screen.getByLabelText('Source page for chapter-page.png')).toHaveProperty('value', '158')
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Adding to Existing book / Part One')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Add reviewed pages' }))

    expect(onAppendPages).toHaveBeenCalledWith(
      'document-1',
      [
        expect.objectContaining({ sourcePageNumber: 157, text: 'Chapter target page' }),
        expect.objectContaining({ sourcePageNumber: 158, text: 'Next chapter target page' }),
      ],
      'chapter-1',
    )
  })
})
