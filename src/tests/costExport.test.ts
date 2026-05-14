import { describe, expect, it, vi } from 'vitest'
import { buildCostReport, exportCostReportCsv, exportCostReportJson } from '../lib/ai/costReport'
import type { AiUsageLineItem, AiUsageTokenBreakdown, DocumentRecord, OcrJob } from '../types/domain'

const documentRecord: DocumentRecord = {
  id: 'doc-1',
  title: 'Structured, Book',
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
  concurrentItemLimit: 10,
  modelId: 'gemini-3.1-flash-lite',
  inputFileCount: 1,
  promptVersion: 'v1',
  warnings: [],
  errorMessage: null,
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-10T12:03:00.000Z',
  completedAt: '2026-05-10T12:03:00.000Z',
}

describe('cost report exports', () => {
  it('exports JSON with filters, summary, rollups, and filtered line items', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T10:00:00.000Z'))
    const report = buildCostReport({
      documents: [documentRecord],
      filters: { confidence: 'estimated', stage: 'ocr_extraction' },
      lineItems: [buildLineItem(), buildLineItem({ id: 'usage-2', stage: 'generated_quiz' })],
      ocrJobs: [ocrJob],
    })
    const parsed = JSON.parse(exportCostReportJson(report)) as {
      exportedAt: string
      filters: { confidence: string; stage: string }
      summary: { recordCount: number; estimatedTotalCost: number }
      rollups: { byDocument: unknown[]; byStage: unknown[] }
      ocrJobBundles: Array<{ itemCount: number; lineItems?: unknown[]; transactionCount: number; items: Array<{ lineItems: unknown[] }> }>
      lineItems: unknown[]
    }

    expect(parsed.exportedAt).toBe('2026-05-12T10:00:00.000Z')
    expect(parsed.filters).toMatchObject({ confidence: 'estimated', stage: 'ocr_extraction' })
    expect(parsed.summary).toMatchObject({ estimatedTotalCost: 0.00042, recordCount: 1 })
    expect(parsed.rollups.byDocument).toHaveLength(1)
    expect(parsed.rollups.byStage).toHaveLength(1)
    expect(parsed.ocrJobBundles).toHaveLength(1)
    expect(parsed.ocrJobBundles[0]).toMatchObject({ itemCount: 1, transactionCount: 1 })
    expect(parsed.ocrJobBundles[0].items[0].lineItems).toHaveLength(1)
    expect(parsed.ocrJobBundles[0].lineItems).toBeUndefined()
    expect(parsed.lineItems).toHaveLength(1)
    expect(parsed.lineItems[0]).toMatchObject({ ocrItemId: 'item-1', ocrItemLabel: 'item-1' })

    vi.useRealTimers()
  })

  it('exports CSV line-item rows with spreadsheet-safe escaping', () => {
    const report = buildCostReport({
      documents: [documentRecord],
      lineItems: [buildLineItem({ failureMessage: 'Needs "review", retry later' })],
      ocrJobs: [ocrJob],
    })
    const rows = exportCostReportCsv(report).split('\n')

    expect(rows[0]).toContain('usage_id,started_at,completed_at,document_id,document_title')
    expect(rows[0]).toContain('ocr_job_id,ocr_job_label,ocr_item_id,ocr_item_label,source_file_name')
    expect(rows[1]).toContain('usage-1,2026-05-10T12:01:00.000Z')
    expect(rows[1]).toContain('"Structured, Book"')
    expect(rows[1]).toContain('job-1,"OCR job, 10 at a time')
    expect(rows[1]).toContain('item-1,item-1,"scan,page.png"')
    expect(rows[1]).toContain('ocr_extraction,interactive,google,gemini-3.1-flash-lite,succeeded,estimated,USD')
    expect(rows[1]).toContain('"Needs ""review"", retry later"')
  })

  it('builds OCR job bundles without dropping line-item export detail', () => {
    const report = buildCostReport({
      documents: [documentRecord],
      lineItems: [
        buildLineItem({ id: 'usage-1-extract', ocrItemId: 'item-1', sourceFileName: 'page-1.png', stage: 'ocr_extraction' }),
        buildLineItem({ id: 'usage-1-clean', ocrItemId: 'item-1', sourceFileName: 'page-1.png', stage: 'ocr_cleaner' }),
        buildLineItem({ id: 'usage-2-extract', ocrItemId: 'item-2', sourceFileName: 'page-2.png', stage: 'ocr_extraction' }),
      ],
      ocrJobs: [{ ...ocrJob, inputFileCount: 2 }],
    })
    const csvRows = exportCostReportCsv(report).split('\n')

    expect(report.ocrJobBundles).toHaveLength(1)
    expect(report.ocrJobBundles[0]).toMatchObject({
      itemCount: 2,
      sourceCount: 2,
      transactionCount: 3,
      totalTokens: 3600,
      estimatedTotalCost: 0.00126,
      confidence: 'estimated',
    })
    expect(report.ocrJobBundles[0].items.map((item) => item.ocrItemLabel)).toEqual(['item-1', 'item-2'])
    expect(report.ocrJobBundles[0].items[0].lineItems.map((lineItem) => lineItem.stage)).toEqual(['ocr_extraction', 'ocr_cleaner'])
    expect(report.lineItems).toHaveLength(3)
    expect(csvRows).toHaveLength(4)
    expect(csvRows[0]).not.toContain('bundle')
  })

  it('labels OCR job bundles with their concurrency limit in reports and exports', () => {
    const report = buildCostReport({
      documents: [documentRecord],
      lineItems: [buildLineItem()],
      ocrJobs: [{ ...ocrJob, concurrentItemLimit: 25 }],
    })
    const rows = exportCostReportCsv(report).split('\n')

    expect(report.ocrJobBundles[0].ocrJobLabel).toContain('OCR job, 25 at a time')
    expect(rows[1]).toContain('job-1,"OCR job, 25 at a time')
  })

  it('builds legacy OCR bundles when usage records do not have an OCR job id', () => {
    const report = buildCostReport({
      documents: [documentRecord],
      lineItems: [
        buildLineItem({
          id: 'legacy-extract',
          ocrJobId: null,
          ocrItemId: 'legacy-item',
          sourceFileName: 'legacy-page.png',
          stage: 'ocr_extraction',
        }),
        buildLineItem({
          id: 'legacy-clean',
          ocrJobId: null,
          ocrItemId: 'legacy-item',
          sourceFileName: 'legacy-page.png',
          stage: 'ocr_cleaner',
        }),
      ],
      ocrJobs: [],
    })

    expect(report.ocrJobBundles).toHaveLength(1)
    expect(report.ocrJobBundles[0]).toMatchObject({
      ocrJobId: null,
      ocrJobLabel: 'OCR bundle May 10, 2026',
      itemCount: 1,
      sourceCount: 1,
      transactionCount: 2,
    })
    expect(report.ocrJobBundles[0].items[0].lineItems.map((lineItem) => lineItem.id)).toEqual(['legacy-extract', 'legacy-clean'])
  })

  it('marks missing pricing or token totals as unknown confidence', () => {
    const report = buildCostReport({
      documents: [documentRecord],
      filters: { confidence: 'unknown' },
      lineItems: [
        buildLineItem({
          id: 'usage-missing-token-total',
          pricingSnapshot: {
            confidence: 'estimated',
            currency: 'USD',
            effectiveDate: '2026-05-12',
            estimatedInputCost: 0.0001,
            estimatedOutputCost: 0.0002,
            estimatedThinkingCost: null,
            estimatedTotalCost: 0.0003,
            inputRatePerMillionTokens: 0.25,
            modelId: 'gemini-3.1-flash-lite',
            outputRatePerMillionTokens: 1.5,
            thinkingRatePerMillionTokens: null,
          },
          tokenBreakdown: {
            inputTokens: 100,
            outputTokens: 200,
            thinkingTokens: null,
            totalTokens: null,
          },
        }),
        buildLineItem({ id: 'usage-missing-pricing', pricingSnapshot: null }),
      ],
      ocrJobs: [ocrJob],
    })

    expect(report.summary.recordCount).toBe(2)
    expect(report.summary.unknownCostCount).toBe(2)
    expect(report.lineItems.map((lineItem) => lineItem.confidence)).toEqual(['unknown', 'unknown'])
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
