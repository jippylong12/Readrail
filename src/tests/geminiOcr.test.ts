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

  it('falls back to local cleanup when cleaner and formatter passes fail', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('cleaner unavailable'))
      .mockRejectedValueOnce(new Error('formatter unavailable'))
    const progress = vi.fn()

    const result = await runOcrPostProcessing(
      { models: { generateContent } },
      {
        titleGuess: 'Sapiens',
        pages: [
          {
            pageNumber: 1,
            sourcePageNumber: null,
            text: '156\nSapiens\nWhy, then, were all of these man-\ndarins men?',
            uncertainSpans: [],
            confidence: null,
            notes: null,
            sourceFileName: null,
          },
        ],
        warnings: [],
      },
      { onProgress: progress },
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
    expect(result.pages[0].sourcePageNumber).toBe(156)
    expect(result.warnings.join(' ')).toContain('Cleaner pass failed')
    expect(result.warnings.join(' ')).toContain('Formatter pass failed')
  })
})
