// @vitest-environment jsdom
import { ThinkingLevel } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'
import {
  applyConservativeOcrCleanup,
  applyOcrFormattingFallback,
  GEMINI_OCR_CLEANUP_CONFIG,
  GEMINI_OCR_FORMAT_CONFIG,
  GEMINI_OCR_GENERATE_CONFIG,
  GEMINI_OCR_MODEL,
  normalizeOcrResult,
  runGeminiOcrFromFiles,
  runOcrPostProcessing,
} from '../lib/ai/geminiOcr'

describe('Gemini OCR normalization', () => {
  it('uses Gemini 3.1 Flash-Lite for OCR', () => {
    expect(GEMINI_OCR_MODEL).toBe('gemini-3.1-flash-lite')
  })

  it('uses Gemini 3 thinking-level keys without a thinking budget', () => {
    expect(GEMINI_OCR_GENERATE_CONFIG.responseMimeType).toBe('application/json')
    expect(GEMINI_OCR_GENERATE_CONFIG.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL })
    expect(GEMINI_OCR_CLEANUP_CONFIG.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.HIGH })
    expect(GEMINI_OCR_FORMAT_CONFIG.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.HIGH })
    expect(JSON.stringify(GEMINI_OCR_GENERATE_CONFIG)).not.toContain('thinkingBudget')
    expect(JSON.stringify(GEMINI_OCR_CLEANUP_CONFIG)).not.toContain('thinkingBudget')
    expect(JSON.stringify(GEMINI_OCR_FORMAT_CONFIG)).not.toContain('thinkingBudget')
  })

  it('preserves page metadata and structured uncertain spans', () => {
    const result = normalizeOcrResult({
      titleGuess: 'Scanned book',
      pages: [
        {
          pageNumber: 12,
          sourcePageNumber: null,
          text: 'Page text',
          confidence: 0.92,
          notes: 'Skewed scan',
          sourceFileName: 'scan-12.png',
          uncertainSpans: [
            {
              text: 'unclear',
              startIndex: 5,
              endIndex: 12,
              confidence: 0.42,
              note: 'blurred',
            },
          ],
        },
      ],
      warnings: ['One page was faint'],
    })

    expect(result).toEqual({
      titleGuess: 'Scanned book',
      pages: [
        {
          pageNumber: 12,
          sourcePageNumber: null,
          text: 'Page text',
          confidence: 0.92,
          notes: 'Skewed scan',
          sourceFileName: 'scan-12.png',
          uncertainSpans: [
            {
              text: 'unclear',
              startIndex: 5,
              endIndex: 12,
              confidence: 0.42,
              note: 'blurred',
            },
          ],
        },
      ],
      warnings: ['One page was faint'],
    })
  })

  it('normalizes legacy string uncertain spans and missing optional fields', () => {
    const result = normalizeOcrResult({
      pages: [
        {
          pageNumber: 1,
          text: 'Legacy uncertainty',
          uncertainSpans: ['[?word]'],
        },
      ],
    })

    expect(result.titleGuess).toBeNull()
    expect(result.warnings).toEqual([])
    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      sourcePageNumber: null,
      text: 'Legacy uncertainty',
      confidence: null,
      notes: null,
      sourceFileName: null,
      uncertainSpans: [
        {
          text: '[?word]',
          startIndex: null,
          endIndex: null,
          confidence: null,
          note: null,
        },
      ],
    })
  })

  it('converts literal escaped newline text into real paragraph breaks', () => {
    const result = normalizeOcrResult({
      pages: [
        {
          pageNumber: 7,
          sourcePageNumber: 156,
          text: 'First paragraph keeps its words.\\n\\nSecond paragraph starts here.',
          notes: 'Formatter returned escaped newlines',
          sourceFileName: 'scan-7.png',
          uncertainSpans: [{ text: 'unclear', note: 'faint ink' }],
        },
      ],
    })

    expect(result.pages[0]).toMatchObject({
      pageNumber: 7,
      sourcePageNumber: 156,
      text: 'First paragraph keeps its words.\n\nSecond paragraph starts here.',
      notes: 'Formatter returned escaped newlines',
      sourceFileName: 'scan-7.png',
      uncertainSpans: [
        {
          text: 'unclear',
          note: 'faint ink',
        },
      ],
    })
    expect(result.pages[0].text).not.toContain('\\n')
  })

  it('clamps confidence values and drops empty uncertain spans', () => {
    const result = normalizeOcrResult({
      pages: [
        {
          text: 'Confidence page',
          confidence: 1.4,
          uncertainSpans: [{ text: '' }, { text: 'low', confidence: -0.5 }],
        },
      ],
    })

    expect(result.pages[0].pageNumber).toBe(1)
    expect(result.pages[0].confidence).toBe(1)
    expect(result.pages[0].uncertainSpans).toEqual([
      {
        text: 'low',
        startIndex: null,
        endIndex: null,
        confidence: 0,
        note: null,
      },
    ])
  })

  it('conservatively removes page headers and repairs OCR hyphenation', () => {
    const result = applyConservativeOcrCleanup({
      titleGuess: 'Sapiens',
      pages: [
        {
          pageNumber: 1,
          sourcePageNumber: null,
          text:
            '156\n' +
            'Sapiens\n' +
            'soldiers are all men, does it follow that the ones managing the war\n' +
            'and enjoying its fruits must also be men?\n' +
            'Why, then, were all of these man-\n' +
            'darins men?',
          uncertainSpans: [],
          confidence: 0.9,
          notes: null,
          sourceFileName: 'scan.png',
        },
      ],
      warnings: [],
    })

    expect(result.pages[0].sourcePageNumber).toBe(156)
    expect(result.pages[0].text).not.toMatch(/^156/m)
    expect(result.pages[0].text).not.toContain('Sapiens')
    expect(result.pages[0].text).toContain('mandarins')
    expect(result.pages[0].notes).toContain('Removed standalone page number')
  })

  it('formats line-wrapped OCR text into paragraphs without changing words', () => {
    expect(applyOcrFormattingFallback('First line\ncontinues here.\n\nSecond para has man-\ndarins.')).toBe(
      'First line continues here.\n\nSecond para has mandarins.',
    )
  })

  it('formats literal escaped newline OCR text into readable paragraphs', () => {
    expect(applyOcrFormattingFallback('First line\\ncontinues here.\\n\\nSecond para has man-\\ndarins.')).toBe(
      'First line continues here.\n\nSecond para has mandarins.',
    )
  })

  it('records OCR extraction, cleaner, and formatter usage with Gemini token metadata', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiResponse('ocr-response', 100, 20, {
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 35 },
          { modality: 'IMAGE', tokenCount: 65 },
        ],
      }))
      .mockResolvedValueOnce(buildGeminiResponse('cleaner-response', 70, 12))
      .mockResolvedValueOnce(buildGeminiResponse('formatter-response', 60, 10))
    const recordUsage = vi.fn()

    await runGeminiOcrFromFiles('api-key', [new File(['scan'], 'scan.png', { type: 'image/png' })], {
      client: { models: { generateContent } },
      usageAttribution: {
        documentId: 'doc-1',
        ocrJobId: 'job-1',
        ocrItemId: 'item-1',
        sourceFileName: 'scan.png',
      },
      recordUsage,
    })

    expect(recordUsage).toHaveBeenCalledTimes(3)
    expect(recordUsage.mock.calls.map((call) => call[0].stage)).toEqual([
      'ocr_extraction',
      'ocr_cleaner',
      'ocr_formatter',
    ])
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-1',
      ocrJobId: 'job-1',
      ocrItemId: 'item-1',
      sourceFileName: 'scan.png',
      provider: 'google',
      model: GEMINI_OCR_MODEL,
      status: 'succeeded',
      rawProviderMetadata: {
        responseId: 'ocr-response',
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 5,
          totalTokenCount: 125,
          cachedContentTokenCount: 8,
        },
      },
      tokenBreakdown: {
        inputTokens: 100,
        outputTokens: 20,
        thinkingTokens: 5,
        totalTokens: 125,
        cachedInputTokens: 8,
        textInputTokens: 35,
        imageInputTokens: 65,
      },
      pricingSnapshot: {
        modelId: GEMINI_OCR_MODEL,
        confidence: 'estimated',
      },
    })
  })

  it('records failed OCR extraction usage when the provider rejects', async () => {
    const generateContent = vi.fn().mockRejectedValueOnce(new Error('Gemini OCR unavailable'))
    const recordUsage = vi.fn()

    await expect(
      runGeminiOcrFromFiles('api-key', [new File(['scan'], 'scan.png', { type: 'image/png' })], {
        client: { models: { generateContent } },
        recordUsage,
      }),
    ).rejects.toThrow('Gemini OCR unavailable')

    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      stage: 'ocr_extraction',
      status: 'failed',
      failureMessage: 'Gemini OCR unavailable',
      rawProviderMetadata: null,
      tokenBreakdown: {
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        totalTokens: null,
      },
      pricingSnapshot: {
        confidence: 'unknown',
      },
    })
  })

  it('records unknown-cost OCR usage when Gemini omits usage metadata', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          pages: [{ pageNumber: 1, text: 'Clean text', uncertainSpans: [] }],
          warnings: [],
        }),
        responseId: 'cleaner-no-usage',
      })
      .mockResolvedValueOnce(buildGeminiResponse('formatter-response', 60, 10))
    const recordUsage = vi.fn()

    await runOcrPostProcessing(
      { models: { generateContent } },
      {
        titleGuess: null,
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'Clean text',
            uncertainSpans: [],
            confidence: null,
            notes: null,
            sourceFileName: null,
          },
        ],
        warnings: [],
      },
      { recordUsage },
    )

    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      stage: 'ocr_cleaner',
      status: 'succeeded',
      rawProviderMetadata: {
        responseId: 'cleaner-no-usage',
        usageMetadata: null,
      },
      tokenBreakdown: {
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        totalTokens: null,
      },
      pricingSnapshot: {
        confidence: 'unknown',
      },
    })
  })

  it('sanitizes escaped newlines from formatter output while preserving page metadata', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          titleGuess: 'Scanned book',
          pages: [
            {
              pageNumber: 1,
              sourcePageNumber: 12,
              text: 'First cleaned line\ncontinues here.\n\nSecond paragraph.',
              uncertainSpans: [{ text: 'unclear', startIndex: 6, endIndex: 13, confidence: 0.4 }],
              confidence: 0.82,
              notes: 'Cleaner note',
              sourceFileName: 'scan-12.png',
            },
          ],
          warnings: ['Cleaner warning'],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          titleGuess: 'Scanned book',
          pages: [
            {
              pageNumber: 1,
              sourcePageNumber: 12,
              text: 'First cleaned line continues here.\\n\\nSecond paragraph.',
              uncertainSpans: [{ text: 'unclear', startIndex: 6, endIndex: 13, confidence: 0.4 }],
              confidence: 0.88,
              notes: 'Formatter note',
              sourceFileName: 'scan-12.png',
            },
          ],
          warnings: ['Formatter warning'],
        }),
      })

    const result = await runOcrPostProcessing(
      { models: { generateContent } },
      {
        titleGuess: 'Scanned book',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: 'First cleaned line\ncontinues here.\n\nSecond paragraph.',
            uncertainSpans: [],
            confidence: null,
            notes: null,
            sourceFileName: 'scan-12.png',
          },
        ],
        warnings: [],
      },
    )

    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      sourcePageNumber: 12,
      text: 'First cleaned line continues here.\n\nSecond paragraph.',
      confidence: 0.88,
      notes: 'Cleaner note Formatter note',
      sourceFileName: 'scan-12.png',
      uncertainSpans: [
        {
          text: 'unclear',
          startIndex: 6,
          endIndex: 13,
          confidence: 0.4,
        },
      ],
    })
    expect(result.pages[0].text).not.toContain('\\n')
    expect(result.warnings).toEqual(['Cleaner warning', 'Formatter warning'])
  })

  it('falls back to local cleanup when cleaner and formatter passes fail', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('cleaner unavailable'))
      .mockRejectedValueOnce(new Error('formatter unavailable'))
    const progress = vi.fn()
    const recordUsage = vi.fn()

    const result = await runOcrPostProcessing(
      { models: { generateContent } },
      {
        titleGuess: 'Sapiens',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: '156\\nSapiens\\nWhy, then, were all of these man-\\ndarins men?',
            uncertainSpans: [],
            confidence: null,
            notes: null,
            sourceFileName: null,
          },
        ],
        warnings: [],
      },
      { onProgress: progress, recordUsage },
    )

    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenNthCalledWith(1, {
      stage: 'cleaner',
      status: 'running',
      message: 'Removing page numbers, headers, footers, and scan artifacts.',
    })
    expect(progress).toHaveBeenNthCalledWith(2, {
      stage: 'cleaner',
      status: 'failed',
      message: 'Cleaner pass failed; using conservative local cleanup.',
    })
    expect(progress).toHaveBeenNthCalledWith(3, {
      stage: 'formatter',
      status: 'running',
      message: 'Repairing paragraph breaks and formatting.',
    })
    expect(progress).toHaveBeenNthCalledWith(4, {
      stage: 'formatter',
      status: 'failed',
      message: 'Formatter pass failed; using cleaned OCR text.',
    })
    expect(generateContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: GEMINI_OCR_MODEL,
        config: GEMINI_OCR_CLEANUP_CONFIG,
      }),
    )
    expect(generateContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: GEMINI_OCR_MODEL,
        config: GEMINI_OCR_FORMAT_CONFIG,
      }),
    )
    expect(result.pages[0].text).toContain('mandarins')
    expect(result.pages[0].text).not.toContain('\\n')
    expect(result.pages[0].sourcePageNumber).toBe(156)
    expect(result.warnings.join(' ')).toContain('Cleaner pass failed')
    expect(result.warnings.join(' ')).toContain('Formatter pass failed')
    expect(recordUsage).toHaveBeenCalledTimes(2)
    expect(recordUsage.mock.calls.map((call) => [call[0].stage, call[0].status, call[0].failureMessage])).toEqual([
      ['ocr_cleaner', 'failed', 'cleaner unavailable'],
      ['ocr_formatter', 'failed', 'formatter unavailable'],
    ])
  })
})

function buildGeminiResponse(
  responseId: string,
  promptTokenCount: number,
  candidatesTokenCount: number,
  metadataOverrides: Record<string, unknown> = {},
) {
  return {
    text: JSON.stringify({
      pages: [{ pageNumber: 1, text: 'Clean text', uncertainSpans: [] }],
      warnings: [],
    }),
    responseId,
    modelVersion: GEMINI_OCR_MODEL,
    createTime: '2026-05-12T10:00:00.000Z',
    usageMetadata: {
      promptTokenCount,
      candidatesTokenCount,
      thoughtsTokenCount: 5,
      totalTokenCount: promptTokenCount + candidatesTokenCount + 5,
      cachedContentTokenCount: 8,
      candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: candidatesTokenCount }],
      ...metadataOverrides,
    },
  }
}
