// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  queryAiUsageLineItemsFromDatabase,
  saveAiUsageLineItemToDatabase,
} from '../lib/db/repository'
import { getDatabase } from '../lib/db/migrations'
import { defaultAiUsageTokenBreakdown, useAppStore } from '../app/store'
import type { AiUsageLineItem } from '../types/domain'

vi.mock('../lib/db/migrations', () => ({
  getDatabase: vi.fn(),
  isTauriRuntime: vi.fn(() => false),
}))

const getDatabaseMock = vi.mocked(getDatabase)

describe('AI usage ledger store behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    getDatabaseMock.mockReset()
    getDatabaseMock.mockResolvedValue(null)
    useAppStore.setState({
      aiUsageLineItems: [],
    })
  })

  it('creates and queries usage line items with stable ids and started timestamps', () => {
    const lineItem = useAppStore.getState().createAiUsageLineItem({
      id: 'usage-1',
      documentId: 'doc-1',
      ocrJobId: 'job-1',
      ocrItemId: 'item-1',
      sourceFileName: 'page-1.png',
      stage: 'ocr_extraction',
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
      startedAt: '2026-05-12T10:00:00.000Z',
    })

    expect(lineItem).toMatchObject({
      id: 'usage-1',
      documentId: 'doc-1',
      ocrJobId: 'job-1',
      ocrItemId: 'item-1',
      sourceFileName: 'page-1.png',
      stage: 'ocr_extraction',
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
      status: 'running',
      startedAt: '2026-05-12T10:00:00.000Z',
      completedAt: null,
    })
    expect(useAppStore.getState().queryAiUsageLineItems({ documentId: 'doc-1', stage: 'ocr_extraction' })).toEqual([
      lineItem,
    ])
  })

  it('updates usage line items without losing started metadata', () => {
    useAppStore.getState().createAiUsageLineItem({
      id: 'usage-2',
      documentId: 'doc-1',
      stage: 'ocr_cleaner',
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
      startedAt: '2026-05-12T10:00:00.000Z',
      tokenBreakdown: {
        inputTokens: 100,
      },
    })

    const updated = useAppStore.getState().updateAiUsageLineItem('usage-2', {
      status: 'succeeded',
      completedAt: '2026-05-12T10:00:03.000Z',
      tokenBreakdown: {
        outputTokens: 25,
        totalTokens: 125,
      },
    })

    expect(updated).toMatchObject({
      id: 'usage-2',
      documentId: 'doc-1',
      stage: 'ocr_cleaner',
      status: 'succeeded',
      startedAt: '2026-05-12T10:00:00.000Z',
      completedAt: '2026-05-12T10:00:03.000Z',
      tokenBreakdown: {
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
      },
    })
  })

  it('retains partial metadata for failed calls and accepts missing optional attribution', () => {
    useAppStore.getState().createAiUsageLineItem({
      id: 'usage-3',
      stage: 'ocr_formatter',
      provider: 'google',
      model: 'gemini-3.1-flash-lite',
      startedAt: '2026-05-12T10:00:00.000Z',
      rawProviderMetadata: {
        requestId: 'provider-request-1',
      },
      tokenBreakdown: {
        inputTokens: 80,
        thinkingTokens: 12,
      },
    })

    const failed = useAppStore.getState().updateAiUsageLineItem('usage-3', {
      status: 'failed',
      completedAt: '2026-05-12T10:00:04.000Z',
      failureMessage: 'Formatter unavailable',
    })

    expect(failed).toMatchObject({
      documentId: null,
      ocrJobId: null,
      ocrItemId: null,
      sourceFileName: null,
      status: 'failed',
      failureMessage: 'Formatter unavailable',
      rawProviderMetadata: {
        requestId: 'provider-request-1',
      },
      tokenBreakdown: {
        inputTokens: 80,
        thinkingTokens: 12,
      },
    })
    expect(useAppStore.getState().queryAiUsageLineItems({ documentId: null })).toHaveLength(1)
  })

  it('clears usage line items when local app data is reset', () => {
    useAppStore.getState().createAiUsageLineItem({
      id: 'usage-4',
      stage: 'generated_quiz',
      provider: 'google',
      model: 'gemini-3-flash-preview',
      startedAt: '2026-05-12T10:00:00.000Z',
    })

    useAppStore.getState().resetAllData()

    expect(useAppStore.getState().aiUsageLineItems).toEqual([])
  })
})

describe('AI usage ledger repository behavior', () => {
  beforeEach(() => {
    getDatabaseMock.mockReset()
  })

  it('upserts usage line items with scalar and JSON fields', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    await saveAiUsageLineItemToDatabase(buildLineItem())

    expect(database.execute).toHaveBeenCalledTimes(1)
    expect(database.execute.mock.calls[0][0]).toContain('INSERT INTO ai_usage_line_items')
    expect(database.execute.mock.calls[0][0]).toContain('ON CONFLICT(id) DO UPDATE SET')
    expect(database.execute.mock.calls[0][1]).toEqual([
      'usage-db-1',
      'doc-1',
      'job-1',
      'item-1',
      'scan.png',
      'ocr_extraction',
      'google',
      'gemini-3.1-flash-lite',
      'succeeded',
      '2026-05-12T10:00:00.000Z',
      '2026-05-12T10:00:02.000Z',
      null,
      JSON.stringify({ responseId: 'abc123' }),
      JSON.stringify({
        ...defaultAiUsageTokenBreakdown,
        inputTokens: 100,
        outputTokens: 20,
        thinkingTokens: 5,
        totalTokens: 125,
      }),
      JSON.stringify({
        effectiveDate: '2026-05-12',
        modelId: 'gemini-3.1-flash-lite',
        currency: 'USD',
        inputRatePerMillionTokens: null,
        outputRatePerMillionTokens: null,
        thinkingRatePerMillionTokens: null,
        estimatedInputCost: null,
        estimatedOutputCost: null,
        estimatedThinkingCost: null,
        estimatedTotalCost: null,
        confidence: 'unknown',
      }),
    ])
  })

  it('queries usage line items with filters and normalizes JSON fields', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([
        {
          id: 'usage-db-1',
          document_id: 'doc-1',
          ocr_job_id: 'job-1',
          ocr_item_id: 'item-1',
          source_file_name: 'scan.png',
          stage: 'ocr_extraction',
          provider: 'google',
          model: 'gemini-3.1-flash-lite',
          status: 'succeeded',
          started_at: '2026-05-12T10:00:00.000Z',
          completed_at: '2026-05-12T10:00:02.000Z',
          failure_message: null,
          raw_provider_metadata_json: JSON.stringify({ responseId: 'abc123' }),
          token_breakdown_json: JSON.stringify({
            inputTokens: 100,
            outputTokens: 20,
            thinkingTokens: 5,
            totalTokens: 125,
          }),
          pricing_snapshot_json: JSON.stringify({
            effectiveDate: '2026-05-12',
            modelId: 'gemini-3.1-flash-lite',
            currency: 'USD',
            confidence: 'unknown',
          }),
        },
      ]),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    const results = await queryAiUsageLineItemsFromDatabase({
      documentId: 'doc-1',
      ocrJobId: 'job-1',
      stage: 'ocr_extraction',
    })

    expect(database.select.mock.calls[0][0]).toContain(
      'WHERE document_id = $1 AND ocr_job_id = $2 AND stage = $3 ORDER BY started_at DESC',
    )
    expect(database.select.mock.calls[0][1]).toEqual(['doc-1', 'job-1', 'ocr_extraction'])
    expect(results).toEqual([buildLineItem()])
  })

  it('supports null attribution filters in repository queries', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([]),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    await queryAiUsageLineItemsFromDatabase({ documentId: null, ocrItemId: null })

    expect(database.select.mock.calls[0][0]).toContain(
      'WHERE document_id IS NULL AND ocr_item_id IS NULL ORDER BY started_at DESC',
    )
    expect(database.select.mock.calls[0][1]).toEqual([])
  })
})

function buildLineItem(): AiUsageLineItem {
  return {
    id: 'usage-db-1',
    documentId: 'doc-1',
    ocrJobId: 'job-1',
    ocrItemId: 'item-1',
    sourceFileName: 'scan.png',
    stage: 'ocr_extraction',
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    status: 'succeeded',
    startedAt: '2026-05-12T10:00:00.000Z',
    completedAt: '2026-05-12T10:00:02.000Z',
    failureMessage: null,
    rawProviderMetadata: {
      responseId: 'abc123',
    },
    tokenBreakdown: {
      ...defaultAiUsageTokenBreakdown,
      inputTokens: 100,
      outputTokens: 20,
      thinkingTokens: 5,
      totalTokens: 125,
    },
    pricingSnapshot: {
      effectiveDate: '2026-05-12',
      modelId: 'gemini-3.1-flash-lite',
      currency: 'USD',
      inputRatePerMillionTokens: null,
      outputRatePerMillionTokens: null,
      thinkingRatePerMillionTokens: null,
      estimatedInputCost: null,
      estimatedOutputCost: null,
      estimatedThinkingCost: null,
      estimatedTotalCost: null,
      confidence: 'unknown',
    },
  }
}
