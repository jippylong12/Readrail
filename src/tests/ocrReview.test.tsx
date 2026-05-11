// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OcrReview } from '../components/OcrReview'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import type { OcrResult } from '../lib/ai/geminiOcr'
import type { DocumentRecord } from '../types/domain'

vi.mock('../lib/ai/geminiOcr', () => ({
  runGeminiOcrFromFiles: vi.fn(),
}))

const runGeminiOcrFromFilesMock = vi.mocked(runGeminiOcrFromFiles)

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

afterEach(() => {
  runGeminiOcrFromFilesMock.mockReset()
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
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).toBeTruthy()
    await user.upload(input!, new File(['image'], 'scan-4.png', { type: 'image/png' }))

    await waitFor(() => expect(screen.getByDisplayValue('OCR Title')).toBeTruthy())
    expect(loadApiKey).toHaveBeenCalledTimes(1)
    expect(promptSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.getByText('62% confidence')).toBeTruthy()
    expect(screen.getByText('1 uncertain span(s)')).toBeTruthy()
    expect(screen.getByText('Cleaner pass removed a repeated header.')).toBeTruthy()
    expect(screen.getByDisplayValue('Low light')).toBeTruthy()

    const pageTextareas = screen.getAllByLabelText('Page text')
    expect(pageTextareas[0]).toHaveProperty('className', expect.stringContaining('ocr-page-textarea'))
    await user.clear(pageTextareas[0])
    await user.type(pageTextareas[0], 'Edited first OCR page')
    const sourcePageInputs = screen.getAllByLabelText('Source page number')
    await user.clear(sourcePageInputs[0])
    await user.type(sourcePageInputs[0], '156')
    await user.selectOptions(screen.getAllByLabelText('Review status')[1], 'reviewed')
    await user.click(screen.getByRole('button', { name: 'Save as new OCR document' }))

    expect(onCreateDocument).toHaveBeenCalledWith('OCR Title', [
      expect.objectContaining({
        pageNumber: 1,
        sourcePageNumber: 156,
        text: 'Edited first OCR page',
        reviewStatus: 'reviewed',
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
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['image'], 'scan.png', { type: 'image/png' }))

    await waitFor(() =>
      expect(screen.getByText('Removing page numbers, headers, footers, and scan artifacts.')).toBeTruthy(),
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
      />,
    )

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input!, new File(['pdf'], 'append.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(screen.getByLabelText('Append to')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Append pages' }))

    expect(onAppendPages).toHaveBeenCalledWith('document-1', [
      expect.objectContaining({
        text: 'Appended page text',
        sourcePageNumber: 156,
        sourceFileName: 'append.pdf',
        sourceKind: 'pdf',
      }),
    ])
  })
})
