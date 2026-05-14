import { GoogleGenAI, createPartFromUri } from '@google/genai'
import type { BatchJob, GenerateContentResponse, InlinedResponse } from '@google/genai'
import type { OcrBatchRunStatus, OcrBatchStage } from '../../types/domain'
import {
  GEMINI_OCR_CLEANUP_CONFIG,
  GEMINI_OCR_FORMAT_CONFIG,
  GEMINI_OCR_GENERATE_CONFIG,
  GEMINI_OCR_MODEL,
  applyConservativeOcrCleanup,
  buildCleanupPrompt,
  buildFormatterPrompt,
  mergeOcrResults,
  normalizeOcrResult,
  type OcrResult,
} from './geminiOcr'
import { buildGeminiTokenBreakdown } from './geminiUsage'

export type GeminiBatchOcrFileInput = {
  itemId: string
  file: File
}

export type GeminiBatchOcrTextInput = {
  itemId: string
  result: OcrResult
}

export type GeminiBatchOcrSubmission = {
  batchName: string | null
  providerState: string | null
  status: OcrBatchRunStatus
  remoteFileNames: string[]
}

export type GeminiBatchOcrResponse = {
  itemId: string
  result: OcrResult | null
  usageMetadata: Record<string, unknown> | null
  tokenBreakdown: ReturnType<typeof buildGeminiTokenBreakdown>
  rawProviderMetadata: Record<string, unknown> | null
  errorMessage: string | null
}

export type GeminiBatchOcrPollResult = {
  batchName: string | null
  providerState: string | null
  status: OcrBatchRunStatus
  completedRequestCount: number
  failedRequestCount: number
  responses: GeminiBatchOcrResponse[]
  errorMessage: string | null
}

type UploadedFileReference = {
  itemId: string
  name: string | null
  uri: string
  mimeType: string
}

export async function submitGeminiOcrExtractionBatch(
  apiKey: string,
  inputs: GeminiBatchOcrFileInput[],
): Promise<GeminiBatchOcrSubmission> {
  const ai = new GoogleGenAI({ apiKey })
  const uploadedFiles = await Promise.all(
    inputs.map(async (input): Promise<UploadedFileReference> => {
      const uploaded = await ai.files.upload({
        file: input.file,
        config: {
          mimeType: input.file.type || 'application/octet-stream',
          displayName: input.file.name,
        },
      })
      return {
        itemId: input.itemId,
        name: uploaded.name ?? null,
        uri: uploaded.uri ?? uploaded.name ?? '',
        mimeType: uploaded.mimeType ?? (input.file.type || 'application/octet-stream'),
      }
    }),
  )

  const batch = await ai.batches.create({
    model: GEMINI_OCR_MODEL,
    src: uploadedFiles.map((uploadedFile) => ({
      model: GEMINI_OCR_MODEL,
      metadata: { itemId: uploadedFile.itemId },
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
            createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
          ],
        },
      ],
      config: GEMINI_OCR_GENERATE_CONFIG,
    })),
    config: {
      displayName: `Readrail OCR extraction ${new Date().toISOString()}`,
    },
  })

  return {
    batchName: batch.name ?? null,
    providerState: batch.state ?? null,
    status: normalizeBatchJobStatus(batch),
    remoteFileNames: uploadedFiles.flatMap((file) => (file.name ? [file.name] : [])),
  }
}

export async function submitGeminiOcrTextBatch(
  apiKey: string,
  stage: Extract<OcrBatchStage, 'cleaner' | 'formatter'>,
  inputs: GeminiBatchOcrTextInput[],
): Promise<GeminiBatchOcrSubmission> {
  const ai = new GoogleGenAI({ apiKey })
  const batch = await ai.batches.create({
    model: GEMINI_OCR_MODEL,
    src: inputs.map((input) => ({
      model: GEMINI_OCR_MODEL,
      metadata: { itemId: input.itemId },
      contents: stage === 'cleaner' ? buildCleanupPrompt(input.result) : buildFormatterPrompt(input.result),
      config: stage === 'cleaner' ? GEMINI_OCR_CLEANUP_CONFIG : GEMINI_OCR_FORMAT_CONFIG,
    })),
    config: {
      displayName: `Readrail OCR ${stage} ${new Date().toISOString()}`,
    },
  })

  return {
    batchName: batch.name ?? null,
    providerState: batch.state ?? null,
    status: normalizeBatchJobStatus(batch),
    remoteFileNames: [],
  }
}

export async function pollGeminiOcrBatch(
  apiKey: string,
  batchName: string,
  fallbackItemIds: string[],
): Promise<GeminiBatchOcrPollResult> {
  const ai = new GoogleGenAI({ apiKey })
  const batch = await ai.batches.get({ name: batchName })
  const responses = normalizeInlineResponses(batch.dest?.inlinedResponses ?? [], fallbackItemIds)
  return {
    batchName: batch.name ?? batchName,
    providerState: batch.state ?? null,
    status: normalizeBatchJobStatus(batch),
    completedRequestCount: responses.filter((response) => response.result).length,
    failedRequestCount: responses.filter((response) => response.errorMessage).length,
    responses,
    errorMessage: formatJobError(batch.error),
  }
}

export async function deleteGeminiFiles(apiKey: string, fileNames: string[]): Promise<string | null> {
  if (!fileNames.length) {
    return null
  }

  const ai = new GoogleGenAI({ apiKey })
  const failures: string[] = []
  for (const name of fileNames) {
    try {
      await ai.files.delete({ name })
    } catch (error) {
      failures.push(`${name}: ${formatErrorMessage(error)}`)
    }
  }
  return failures.length ? `Gemini File API cleanup failed for ${failures.length} file(s). ${failures.join(' ')}` : null
}

export function applyBatchCleanerResult(previous: OcrResult, next: OcrResult | null): OcrResult {
  return mergeOcrResults(applyConservativeOcrCleanup(previous), next ?? applyConservativeOcrCleanup(previous))
}

export function applyBatchFormatterResult(previous: OcrResult, next: OcrResult | null): OcrResult {
  return next ? mergeOcrResults(previous, next) : previous
}

function normalizeInlineResponses(
  responses: InlinedResponse[],
  fallbackItemIds: string[],
): GeminiBatchOcrResponse[] {
  return responses.map((inlineResponse, index) => {
    const response = inlineResponse.response
    const itemId =
      typeof inlineResponse.metadata?.itemId === 'string'
        ? inlineResponse.metadata.itemId
        : fallbackItemIds[index] ?? `batch-item-${index + 1}`
    const errorMessage = inlineResponse.error ? formatJobError(inlineResponse.error) : null
    const text = getResponseText(response)
    const result = !errorMessage && text ? normalizeOcrResult(JSON.parse(text)) : null
    const tokenBreakdown = buildGeminiTokenBreakdown(response?.usageMetadata)
    return {
      itemId,
      result,
      usageMetadata: response?.usageMetadata ? { ...response.usageMetadata } : null,
      tokenBreakdown,
      rawProviderMetadata: buildRawProviderMetadata(response),
      errorMessage,
    }
  })
}

function normalizeBatchJobStatus(batch: BatchJob): OcrBatchRunStatus {
  const state = String(batch.state ?? '').toUpperCase()
  if (state.includes('SUCCEEDED')) {
    return 'succeeded'
  }
  if (state.includes('FAILED')) {
    return 'failed'
  }
  if (state.includes('CANCELLED')) {
    return 'cancelled'
  }
  if (state.includes('EXPIRED')) {
    return 'expired'
  }
  if (state.includes('RUNNING')) {
    return 'running'
  }
  return 'submitted'
}

function getResponseText(response: GenerateContentResponse | undefined): string | null {
  return response?.text ?? null
}

function buildRawProviderMetadata(response: GenerateContentResponse | undefined): Record<string, unknown> | null {
  if (!response) {
    return null
  }
  return {
    responseId: response.responseId ?? null,
    modelVersion: response.modelVersion ?? null,
    createTime: response.createTime ?? null,
    usageMetadata: response.usageMetadata ?? null,
  }
}

function formatJobError(error: unknown): string | null {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  if (!record) {
    return null
  }
  const message = typeof record.message === 'string' ? record.message : ''
  const code = typeof record.code === 'number' || typeof record.code === 'string' ? ` (${record.code})` : ''
  return message ? `${message}${code}` : JSON.stringify(record)
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error.'
}
