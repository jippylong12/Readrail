// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CostsReport } from '../components/CostsReport'
import type { AiUsageLineItem, AiUsageTokenBreakdown, DocumentRecord, OcrJob } from '../types/domain'

const documentRecord: DocumentRecord = {
  id: 'doc-1',
  title: 'Sample book',
  sourceType: 'photo_ocr',
  content: 'OCR text.',
  wordCount: 2,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-10T12:00:00.000Z',
  archivedAt: null,
}

const ocrJob: OcrJob = {
  id: 'job-1',
  documentId: 'doc-1',
  targetChapterId: null,
  status: 'saved',
  modelId: 'gemini-3.1-flash-lite',
  inputFileCount: 1,
  promptVersion: 'v1',
  warnings: [],
  errorMessage: null,
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-10T12:03:00.000Z',
  completedAt: '2026-05-10T12:03:00.000Z',
}

afterEach(() => {
  cleanup()
})

describe('CostsReport', () => {
  it('shows a usable empty state when there are no usage records', () => {
    render(<CostsReport documents={[documentRecord]} lineItems={[]} ocrJobs={[]} />)

    expect(screen.getByRole('heading', { name: 'AI usage costs' })).toBeTruthy()
    expect(screen.getByText('No AI usage records yet')).toBeTruthy()
    expect(screen.getByLabelText('Start date')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('filters report rows and rollups by stage', async () => {
    const user = userEvent.setup()
    render(
      <CostsReport
        documents={[documentRecord]}
        lineItems={[
          buildLineItem({ id: 'usage-ocr', sourceFileName: 'scan.png', stage: 'ocr_extraction' }),
          buildLineItem({
            id: 'usage-quiz',
            ocrJobId: null,
            ocrItemId: null,
            sourceFileName: null,
            stage: 'generated_quiz',
            startedAt: '2026-05-11T12:01:00.000Z',
          }),
        ]}
        ocrJobs={[ocrJob]}
      />,
    )

    expect(screen.getByText('scan.png')).toBeTruthy()
    expect(screen.getAllByText('Generated quiz').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Stage'), 'generated_quiz')

    expect(screen.queryByText('scan.png')).toBeNull()
    expect(screen.getByText('No source file')).toBeTruthy()
    expect(screen.getAllByText('No OCR job').length).toBeGreaterThan(0)
  })

  it('renders rollups by document, OCR job, stage, model, and time period', async () => {
    const user = userEvent.setup()
    render(<CostsReport documents={[documentRecord]} lineItems={[buildLineItem()]} ocrJobs={[ocrJob]} />)

    expect(screen.getByRole('heading', { name: 'By document' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'By OCR job' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'By stage' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'By model' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'By time period' })).toBeTruthy()
    expect(screen.getAllByText('Sample book').length).toBeGreaterThan(0)
    expect(screen.getAllByText('google / gemini-3.1-flash-lite').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Time rollup'), 'month')

    expect((screen.getByLabelText('Time rollup') as HTMLSelectElement).value).toBe('month')
  })

  it('visibly marks missing pricing metadata as unknown cost confidence', () => {
    render(
      <CostsReport
        documents={[documentRecord]}
        lineItems={[
          buildLineItem({
            id: 'unknown-usage',
            pricingSnapshot: null,
            tokenBreakdown: { totalTokens: null },
          }),
        ]}
        ocrJobs={[ocrJob]}
      />,
    )

    expect(screen.getByText('Unknown costs')).toBeTruthy()
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
  })
})

function buildLineItem(
  overrides: Partial<Omit<AiUsageLineItem, 'tokenBreakdown'>> & {
    tokenBreakdown?: Partial<AiUsageTokenBreakdown>
  } = {},
): AiUsageLineItem {
  return {
    id: 'usage-1',
    documentId: 'doc-1',
    ocrJobId: 'job-1',
    ocrItemId: 'item-1',
    sourceFileName: 'scan,page.png',
    stage: 'ocr_extraction',
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    status: 'succeeded',
    startedAt: '2026-05-10T12:01:00.000Z',
    completedAt: '2026-05-10T12:02:00.000Z',
    failureMessage: null,
    rawProviderMetadata: null,
    pricingSnapshot: {
      confidence: 'estimated',
      currency: 'USD',
      effectiveDate: '2026-05-12',
      estimatedInputCost: 0.00025,
      estimatedOutputCost: 0.00017,
      estimatedThinkingCost: null,
      estimatedTotalCost: 0.00042,
      inputRatePerMillionTokens: 0.25,
      modelId: 'gemini-3.1-flash-lite',
      outputRatePerMillionTokens: 1.5,
      thinkingRatePerMillionTokens: null,
    },
    ...overrides,
    tokenBreakdown: {
      audioInputTokens: null,
      audioOutputTokens: null,
      cachedAudioInputTokens: null,
      cachedDocumentInputTokens: null,
      cachedImageInputTokens: null,
      cachedInputTokens: null,
      cachedTextInputTokens: null,
      cachedVideoInputTokens: null,
      documentInputTokens: null,
      documentOutputTokens: null,
      imageInputTokens: 200,
      imageOutputTokens: null,
      inputTokens: 1000,
      outputTokens: 200,
      textInputTokens: 800,
      textOutputTokens: 200,
      thinkingTokens: null,
      totalTokens: 1200,
      videoInputTokens: null,
      videoOutputTokens: null,
      ...overrides.tokenBreakdown,
    },
  }
}
