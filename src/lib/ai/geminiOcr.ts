import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { OcrUncertainSpan } from '../../types/domain'
import {
  captureGeminiUsage,
  type GeminiUsageAttribution,
  type GeminiUsageRecorder,
} from './geminiUsage'

export const GEMINI_OCR_MODEL = 'gemini-3.1-flash-lite'
export const GEMINI_OCR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    titleGuess: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'number' },
          text: { type: 'string' },
          uncertainSpans: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    startIndex: {
                      anyOf: [{ type: 'number' }, { type: 'null' }],
                    },
                    endIndex: {
                      anyOf: [{ type: 'number' }, { type: 'null' }],
                    },
                    confidence: {
                      anyOf: [{ type: 'number' }, { type: 'null' }],
                    },
                    note: {
                      anyOf: [{ type: 'string' }, { type: 'null' }],
                    },
                  },
                  required: ['text'],
                },
              ],
            },
          },
          confidence: {
            anyOf: [{ type: 'number' }, { type: 'null' }],
          },
          notes: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          sourceFileName: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
        required: ['pageNumber', 'text', 'uncertainSpans'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['pages', 'warnings'],
} as const
export const GEMINI_OCR_GENERATE_CONFIG = {
  responseMimeType: 'application/json',
  responseJsonSchema: GEMINI_OCR_RESPONSE_SCHEMA,
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
} as const
export const GEMINI_OCR_CLEANUP_CONFIG = {
  responseMimeType: 'application/json',
  responseJsonSchema: GEMINI_OCR_RESPONSE_SCHEMA,
  thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
} as const
export const GEMINI_OCR_FORMAT_CONFIG = GEMINI_OCR_CLEANUP_CONFIG

export type OcrResultPage = {
  pageNumber: number
  sourcePageNumber: number | null
  text: string
  uncertainSpans: OcrUncertainSpan[]
  confidence: number | null
  notes: string | null
  sourceFileName: string | null
}

export type OcrResult = {
  titleGuess: string | null
  pages: OcrResultPage[]
  warnings: string[]
}

export type OcrPipelineStage = 'ocr' | 'cleaner' | 'formatter'

export type OcrPipelineProgress = {
  stage: OcrPipelineStage
  status: 'running' | 'done' | 'failed'
  message: string
}

type OcrGenerationClient = Pick<GoogleGenAI['models'], 'generateContent'>

export type RunGeminiOcrOptions = {
  onProgress?: (progress: OcrPipelineProgress) => void
  recordUsage?: GeminiUsageRecorder
  usageAttribution?: GeminiUsageAttribution
  client?: GoogleGenAI | { models: OcrGenerationClient }
}

export async function runGeminiOcrFromFiles(
  apiKey: string,
  files: File[],
  options: RunGeminiOcrOptions = {},
): Promise<OcrResult> {
  const ai = options.client ?? new GoogleGenAI({ apiKey })
  const fileParts = await Promise.all(files.map(fileToInlinePart))

  options.onProgress?.({
    stage: 'ocr',
    status: 'running',
    message: 'Reading scans with Gemini OCR.',
  })
  const rawResult = await captureGeminiUsage({
    model: GEMINI_OCR_MODEL,
    stage: 'ocr_extraction',
    attribution: options.usageAttribution,
    recordUsage: options.recordUsage,
    generateContent: () =>
      ai.models.generateContent({
        model: GEMINI_OCR_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Perform faithful OCR only. Preserve headings, paragraph breaks, lists, page breaks, and reading order. ' +
                  'For meaningful non-text images, figures, charts, diagrams, illustrations, or photos, insert a concise bracketed accessibility description in the page text using this exact form: [Image description: ...]. Preserve printed captions as normal text near the description. Skip purely decorative marks. Describe only visible content; do not invent details. ' +
                  'Mark uncertain words with [?word]. Return strict JSON with titleGuess, pages, and warnings. Do not summarize or add missing content.',
              },
              ...fileParts,
            ],
          },
        ],
        config: GEMINI_OCR_GENERATE_CONFIG,
      }),
    consumeResponse: (response) => normalizeOcrResult(JSON.parse(response.text ?? '{}')),
  })
  options.onProgress?.({
    stage: 'ocr',
    status: 'done',
    message: 'OCR text extracted.',
  })
  return runOcrPostProcessing(ai, rawResult, options)
}

export async function runOcrPostProcessing(
  client: GoogleGenAI | { models: OcrGenerationClient },
  result: OcrResult,
  options: RunGeminiOcrOptions = {},
): Promise<OcrResult> {
  const locallyCleaned = applyConservativeOcrCleanup(result)
  let cleaned: OcrResult

  try {
    options.onProgress?.({
      stage: 'cleaner',
      status: 'running',
      message: 'Removing page numbers, headers, footers, and scan artifacts.',
    })
    cleaned = mergeOcrResults(
      locallyCleaned,
      await captureGeminiUsage({
        model: GEMINI_OCR_MODEL,
        stage: 'ocr_cleaner',
        attribution: options.usageAttribution,
        recordUsage: options.recordUsage,
        generateContent: () =>
          client.models.generateContent({
            model: GEMINI_OCR_MODEL,
            contents: buildCleanupPrompt(locallyCleaned),
            config: GEMINI_OCR_CLEANUP_CONFIG,
          }),
        consumeResponse: (response) => normalizeOcrResult(JSON.parse(response.text ?? '{}')),
      }),
    )
    options.onProgress?.({
      stage: 'cleaner',
      status: 'done',
      message: 'Cleaner pass finished.',
    })
  } catch (cleanupError) {
    options.onProgress?.({
      stage: 'cleaner',
      status: 'failed',
      message: 'Cleaner pass failed; using conservative local cleanup.',
    })
    cleaned = {
      ...locallyCleaned,
      warnings: [
        ...locallyCleaned.warnings,
        `Cleaner pass failed; showing conservative local cleanup. ${formatErrorMessage(cleanupError)}`,
      ],
    }
  }

  try {
    options.onProgress?.({
      stage: 'formatter',
      status: 'running',
      message: 'Repairing paragraph breaks and formatting.',
    })
    const formatted = mergeOcrResults(
      cleaned,
      await captureGeminiUsage({
        model: GEMINI_OCR_MODEL,
        stage: 'ocr_formatter',
        attribution: options.usageAttribution,
        recordUsage: options.recordUsage,
        generateContent: () =>
          client.models.generateContent({
            model: GEMINI_OCR_MODEL,
            contents: buildFormatterPrompt(cleaned),
            config: GEMINI_OCR_FORMAT_CONFIG,
          }),
        consumeResponse: (response) => normalizeOcrResult(JSON.parse(response.text ?? '{}')),
      }),
    )
    options.onProgress?.({
      stage: 'formatter',
      status: 'done',
      message: 'Formatter pass finished.',
    })
    return formatted
  } catch (formatError) {
    options.onProgress?.({
      stage: 'formatter',
      status: 'failed',
      message: 'Formatter pass failed; using cleaned OCR text.',
    })
    return {
      ...cleaned,
      warnings: [
        ...cleaned.warnings,
        `Formatter pass failed; showing cleaned OCR text. ${formatErrorMessage(formatError)}`,
      ],
    }
  }
}

export function normalizeOcrResult(result: unknown): OcrResult {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
  return {
    titleGuess: typeof record.titleGuess === 'string' && record.titleGuess.trim() ? record.titleGuess.trim() : null,
    pages: Array.isArray(record.pages)
      ? record.pages.map((rawPage, index) => {
          const page = rawPage && typeof rawPage === 'object' ? (rawPage as Record<string, unknown>) : {}
          return {
            pageNumber: Number(page.pageNumber ?? index + 1),
            sourcePageNumber: normalizeNullableNumber(page.sourcePageNumber),
            text: normalizeOcrText(String(page.text ?? '')),
            uncertainSpans: normalizeUncertainSpans(page.uncertainSpans),
            confidence: normalizeConfidence(page.confidence),
            notes: typeof page.notes === 'string' && page.notes.trim() ? page.notes.trim() : null,
            sourceFileName:
              typeof page.sourceFileName === 'string' && page.sourceFileName.trim() ? page.sourceFileName.trim() : null,
          }
        })
      : [],
    warnings: Array.isArray(record.warnings) ? record.warnings.map(String) : [],
  }
}

export function applyConservativeOcrCleanup(result: OcrResult): OcrResult {
  const repeatedHeaders = findRepeatedEdgeLines(result.pages, 'first')
  const repeatedFooters = findRepeatedEdgeLines(result.pages, 'last')
  return {
    ...result,
    pages: result.pages.map((page) => cleanOcrPage(page, repeatedHeaders, repeatedFooters)),
  }
}

export function applyOcrFormattingFallback(text: string): string {
  return normalizeOcrText(text)
    .replace(/\r\n?/g, '\n')
    .replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join('\n\n')
}

function cleanOcrPage(
  page: OcrResultPage,
  repeatedHeaders: Set<string>,
  repeatedFooters: Set<string>,
): OcrResultPage {
  const artifacts: string[] = []
  const lines = normalizeOcrText(page.text).split('\n')
  const firstContentIndex = lines.findIndex((line) => line.trim())
  let sourcePageNumber = page.sourcePageNumber

  if (firstContentIndex >= 0) {
    const firstLine = lines[firstContentIndex]?.trim() ?? ''
    const detectedPageNumber = parseStandalonePageNumber(firstLine)
    if (detectedPageNumber !== null) {
      sourcePageNumber = sourcePageNumber ?? detectedPageNumber
      artifacts.push(`Removed standalone page number "${firstLine}".`)
      lines.splice(firstContentIndex, 1)
    }
  }

  const nextContentIndex = lines.findIndex((line) => line.trim())
  if (nextContentIndex >= 0) {
    const headerCandidate = lines[nextContentIndex]?.trim() ?? ''
    const hasEnoughRemainingText = lines.slice(nextContentIndex + 1).join(' ').trim().length > 120
    if ((repeatedHeaders.has(normalizeEdgeLine(headerCandidate)) || isLikelyRunningHeader(headerCandidate)) && hasEnoughRemainingText) {
      artifacts.push(`Removed likely running header "${headerCandidate}".`)
      lines.splice(nextContentIndex, 1)
    }
  }

  const lastContentIndex = findLastContentLineIndex(lines)
  if (lastContentIndex >= 0) {
    const footerCandidate = lines[lastContentIndex]?.trim() ?? ''
    if (repeatedFooters.has(normalizeEdgeLine(footerCandidate))) {
      artifacts.push(`Removed repeated footer "${footerCandidate}".`)
      lines.splice(lastContentIndex, 1)
    }
  }

  const text = applyOcrFormattingFallback(lines.join('\n'))
  return {
    ...page,
    sourcePageNumber,
    text,
    notes: appendNotes(page.notes, artifacts),
  }
}

function buildCleanupPrompt(result: OcrResult): string {
  return [
    'Clean OCR output conservatively. Return the same JSON shape.',
    'Remove only obvious scanned-book artifacts: standalone page numbers, repeated running headers or footers, broken hyphenation across line breaks, and empty scan noise.',
    'Preserve bracketed accessibility descriptions exactly when they use the form [Image description: ...]. Do not treat those descriptions as scan noise or uncertain text.',
    'Do not summarize, paraphrase, modernize, reorder, or add content.',
    'If you remove headers, footers, or page-number artifacts, add a short note to that page notes field.',
    'Keep pageNumber as the current page order. Put detected book/scanned page numbers in sourcePageNumber.',
    JSON.stringify(result),
  ].join('\n\n')
}

function buildFormatterPrompt(result: OcrResult): string {
  return [
    'Format cleaned OCR text for reading. Return the same JSON shape.',
    'Repair paragraph breaks and spacing while preserving all words, punctuation, order, page metadata, notes, warnings, and uncertain spans.',
    'Use real paragraph breaks in page text. In returned JSON strings, newline escapes must parse to actual newline characters. Never leave literal backslash-n text such as \\n or \\n\\n in page content.',
    'Preserve [Image description: ...] blocks as readable standalone paragraphs when present. Do not remove, paraphrase, or convert them into uncertain spans.',
    'Do not remove content except empty formatting noise. Do not summarize or rewrite meaning.',
    JSON.stringify(result),
  ].join('\n\n')
}

function mergeOcrResults(previous: OcrResult, next: OcrResult): OcrResult {
  return {
    titleGuess: next.titleGuess ?? previous.titleGuess,
    warnings: [...previous.warnings, ...next.warnings],
    pages: previous.pages.map((previousPage, index) => {
      const nextPage = next.pages[index]
      if (!nextPage) {
        return previousPage
      }

      return {
        ...previousPage,
        pageNumber: Number.isFinite(nextPage.pageNumber) ? nextPage.pageNumber : previousPage.pageNumber,
        sourcePageNumber: nextPage.sourcePageNumber ?? previousPage.sourcePageNumber,
        text: normalizeOcrText(nextPage.text || previousPage.text),
        uncertainSpans: nextPage.uncertainSpans.length ? nextPage.uncertainSpans : previousPage.uncertainSpans,
        confidence: nextPage.confidence ?? previousPage.confidence,
        notes: mergeNotes(previousPage.notes, nextPage.notes),
        sourceFileName: nextPage.sourceFileName ?? previousPage.sourceFileName,
      }
    }),
  }
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/[ \t\f\v]*\n[ \t\f\v]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

function findRepeatedEdgeLines(pages: OcrResultPage[], edge: 'first' | 'last'): Set<string> {
  const counts = new Map<string, number>()
  pages.forEach((page) => {
    const lines = normalizeOcrText(page.text)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const line = edge === 'first' ? lines[0] : lines[lines.length - 1]
    const normalized = normalizeEdgeLine(line ?? '')
    if (normalized && parseStandalonePageNumber(normalized) === null) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }
  })

  return new Set([...counts].filter(([, count]) => count > 1).map(([line]) => line))
}

function normalizeEdgeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseStandalonePageNumber(value: string): number | null {
  if (!/^\d{1,4}$/.test(value.trim())) {
    return null
  }

  return Number(value.trim())
}

function isLikelyRunningHeader(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > 48 || /[.!?;:]$/.test(trimmed)) {
    return false
  }

  return /^[\p{L}\p{N}'’\- ]+$/u.test(trimmed) && trimmed.split(/\s+/).length <= 6
}

function findLastContentLineIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim()) {
      return index
    }
  }

  return -1
}

function appendNotes(notes: string | null, additions: string[]): string | null {
  if (additions.length === 0) {
    return notes
  }

  return mergeNotes(notes, additions.join(' '))
}

function mergeNotes(left: string | null, right: string | null): string | null {
  const notes = [left, right].map((note) => note?.trim()).filter(Boolean)
  return notes.length ? notes.join(' ') : null
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error.'
}

function normalizeUncertainSpans(value: unknown): OcrUncertainSpan[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((span): OcrUncertainSpan | null => {
      if (typeof span === 'string') {
        return {
          text: span,
          startIndex: null,
          endIndex: null,
          confidence: null,
          note: null,
        }
      }

      if (!span || typeof span !== 'object') {
        return null
      }

      const record = span as Partial<OcrUncertainSpan>
      return {
        text: String(record.text ?? ''),
        startIndex: normalizeNullableNumber(record.startIndex),
        endIndex: normalizeNullableNumber(record.endIndex),
        confidence: normalizeConfidence(record.confidence),
        note: typeof record.note === 'string' && record.note.trim() ? record.note.trim() : null,
      }
    })
    .filter((span): span is OcrUncertainSpan => Boolean(span && span.text.trim()))
}

function normalizeConfidence(value: unknown): number | null {
  const confidence = normalizeNullableNumber(value)
  if (confidence === null) {
    return null
  }

  return Math.max(0, Math.min(1, confidence))
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

async function fileToInlinePart(file: File) {
  const data = await fileToBase64(file)
  return {
    inlineData: {
      mimeType: file.type || 'application/octet-stream',
      data,
    },
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const value = String(reader.result)
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
