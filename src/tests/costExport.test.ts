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
      lineItems: unknown[]
    }

    expect(parsed.exportedAt).toBe('2026-05-12T10:00:00.000Z')
    expect(parsed.filters).toMatchObject({ confidence: 'estimated', stage: 'ocr_extraction' })
    expect(parsed.summary).toMatchObject({ estimatedTotalCost: 0.00042, recordCount: 1 })
    expect(parsed.rollups.byDocument).toHaveLength(1)
    expect(parsed.rollups.byStage).toHaveLength(1)
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
    expect(rows[1]).toContain('job-1,"OCR job')
    expect(rows[1]).toContain('item-1,item-1,"scan,page.png"')
    expect(rows[1]).toContain('ocr_extraction,google,gemini-3.1-flash-lite,succeeded,estimated,USD')
    expect(rows[1]).toContain('"Needs ""review"", retry later"')
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
