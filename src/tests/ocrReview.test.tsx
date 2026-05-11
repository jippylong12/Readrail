// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrReview } from '../components/OcrReview'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { stripImageMetadata } from '../lib/files/imageMetadata'
import type { OcrResult } from '../lib/ai/geminiOcr'
import type { DocumentChapterRecord, DocumentRecord } from '../types/domain'

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

afterEach(() => {
  runGeminiOcrFromFilesMock.mockReset()
  stripImageMetadataMock.mockReset()
  stripImageMetadataMock.mockImplementation(async (file) => ({ file, stripped: false, warning: null }))
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

    await waitFor(() =>
      expect(screen.getByText('Processing item 1 of 1: Removing page numbers, headers, footers, and scan artifacts.')).toBeTruthy(),
    )
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33')
    expect(screen.getByText('OCR: done')).toBeTruthy()
    expect(screen.getByText('Cleaner: running')).toBeTruthy()
    expect(screen.getByText('Formatter: waiting')).toBeTruthy()

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
    await user.click(screen.getAllByRole('button', { name: 'Down' })[0])
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
        sourcePageNumber: 10,
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
    expect(screen.getByText('Processing item 2 of 2: Reading scans with Gemini OCR.')).toBeTruthy()
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
    const onSaveOcrJob = vi.fn()
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
        onSaveOcrJob={onSaveOcrJob}
        preservePageBreaks
        stripImageMetadataBeforeOcr={false}
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['good'], 'good-page.png', { type: 'image/png' }),
      new File(['bad'], 'bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Successful page text.')).toBeTruthy())
    expect(screen.getByText('Failed 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Gemini could not read the scan.')).toBeTruthy()
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
    const lastSavedJob = onSaveOcrJob.mock.calls.at(-1)
    expect(lastSavedJob?.[0]).toMatchObject({ status: 'saved', inputFileCount: 2 })
    expect(lastSavedJob?.[1].map((item: { status: string }) => item.status)).toEqual(['review', 'skipped'])
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
      new File(['bad'], 'bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Failed 1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Temporary OCR failure.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Approved 2')).toBeTruthy())
    expect(screen.getByDisplayValue('Recovered page.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByDisplayValue('Already successful.')).toBeTruthy()
    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual([
      'good-page.png',
      'bad-page.png',
      'bad-page.png',
    ])

    await user.click(screen.getByRole('button', { name: 'Create document from pages' }))
    expect(onCreateDocument).toHaveBeenCalledWith('Retry import', [
      expect.objectContaining({ sourceFileName: 'good-page.png', text: 'Already successful.' }),
      expect.objectContaining({ sourceFileName: 'bad-page.png', text: 'Recovered page.' }),
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
      new File(['bad'], 'bad-page.png', { type: 'image/png' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Failed 1')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Unreadable original.')).toBeTruthy()
    await user.upload(
      screen.getByLabelText('Replacement file for bad-page.png'),
      new File(['replacement'], 'replacement-page.png', { type: 'image/png' }),
    )

    await waitFor(() => expect(screen.getByDisplayValue('Replacement page text.')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByDisplayValue('Kept page text.')).toBeTruthy()
    expect(runGeminiOcrFromFilesMock.mock.calls.map((call) => call[1][0]?.name)).toEqual([
      'good-page.png',
      'bad-page.png',
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
    expect(screen.getByLabelText('Add to chapter')).toHaveProperty('value', 'chapter-1')
    await user.selectOptions(screen.getByLabelText('Add to chapter'), 'chapter-2')
    expect(screen.getByText('New pages will be added to Part Two.')).toBeTruthy()

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, [
      new File(['image'], 'chapter-page.png', { type: 'image/png' }),
      new File(['image'], 'chapter-page-2.png', { type: 'image/png' }),
    ])
    expect(screen.getByLabelText('Source page for chapter-page.png')).toHaveProperty('value', '157')
    expect(screen.getByLabelText('Source page for chapter-page-2.png')).toHaveProperty('value', '158')
    await user.click(screen.getByRole('button', { name: 'Process 2 page(s)' }))

    await waitFor(() => expect(screen.getByText('Adding to Existing book / Part Two')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Add reviewed pages' }))

    expect(onAppendPages).toHaveBeenCalledWith(
      'document-1',
      [
        expect.objectContaining({ sourcePageNumber: 157, text: 'Chapter target page' }),
        expect.objectContaining({ sourcePageNumber: 158, text: 'Next chapter target page' }),
      ],
      'chapter-2',
    )
  })
})
