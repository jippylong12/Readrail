import type {
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
  ModalityTokenCount,
} from '@google/genai'
import type {
  AiBillingMode,
  AiPricingSnapshot,
  AiUsageStage,
  AiUsageStatus,
  AiUsageTokenBreakdown,
} from '../../types/domain'
import { estimateAiUsageCost } from './pricing'

const GEMINI_PROVIDER = 'google'

export type GeminiUsageAttribution = {
  documentId?: string | null
  ocrJobId?: string | null
  ocrItemId?: string | null
  sourceFileName?: string | null
  billingMode?: AiBillingMode
}

export type GeminiUsageLineItemInput = GeminiUsageAttribution & {
  stage: AiUsageStage
  provider: string
  model: string
  status: AiUsageStatus
  startedAt: string
  completedAt: string | null
  failureMessage: string | null
  rawProviderMetadata: Record<string, unknown> | null
  tokenBreakdown: Partial<AiUsageTokenBreakdown> | null
  pricingSnapshot: AiPricingSnapshot | null
}

export type GeminiUsageRecorder = (lineItem: GeminiUsageLineItemInput) => void

type CaptureGeminiUsageInput<T> = {
  model: string
  stage: AiUsageStage
  attribution?: GeminiUsageAttribution
  recordUsage?: GeminiUsageRecorder
  generateContent: () => Promise<GenerateContentResponse>
  consumeResponse: (response: GenerateContentResponse) => T | Promise<T>
}

export async function captureGeminiUsage<T>(input: CaptureGeminiUsageInput<T>): Promise<T> {
  const startedAt = new Date().toISOString()
  let response: GenerateContentResponse | null = null

  try {
    response = await input.generateContent()
    const result = await input.consumeResponse(response)
    recordGeminiUsage(input, {
      response,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'succeeded',
      failureMessage: null,
    })
    return result
  } catch (error) {
    recordGeminiUsage(input, {
      response,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'failed',
      failureMessage: formatUsageFailureMessage(error),
    })
    throw error
  }
}

export function buildGeminiTokenBreakdown(
  usageMetadata: GenerateContentResponseUsageMetadata | undefined,
): Partial<AiUsageTokenBreakdown> {
  const tokenBreakdown: Partial<AiUsageTokenBreakdown> = {
    inputTokens: normalizeTokenCount(usageMetadata?.promptTokenCount),
    outputTokens: normalizeTokenCount(usageMetadata?.candidatesTokenCount),
    thinkingTokens: normalizeTokenCount(usageMetadata?.thoughtsTokenCount),
    totalTokens: normalizeTokenCount(usageMetadata?.totalTokenCount),
    cachedInputTokens: normalizeTokenCount(usageMetadata?.cachedContentTokenCount),
  }

  applyModalityTokenCounts(tokenBreakdown, usageMetadata?.promptTokensDetails, {
    TEXT: 'textInputTokens',
    IMAGE: 'imageInputTokens',
    AUDIO: 'audioInputTokens',
    VIDEO: 'videoInputTokens',
    DOCUMENT: 'documentInputTokens',
  })
  applyModalityTokenCounts(tokenBreakdown, usageMetadata?.candidatesTokensDetails, {
    TEXT: 'textOutputTokens',
    IMAGE: 'imageOutputTokens',
    AUDIO: 'audioOutputTokens',
    VIDEO: 'videoOutputTokens',
    DOCUMENT: 'documentOutputTokens',
  })
  applyModalityTokenCounts(tokenBreakdown, usageMetadata?.cacheTokensDetails, {
    TEXT: 'cachedTextInputTokens',
    IMAGE: 'cachedImageInputTokens',
    AUDIO: 'cachedAudioInputTokens',
    VIDEO: 'cachedVideoInputTokens',
    DOCUMENT: 'cachedDocumentInputTokens',
  })

  return tokenBreakdown
}

function recordGeminiUsage<T>(
  input: CaptureGeminiUsageInput<T>,
  result: {
    response: GenerateContentResponse | null
    startedAt: string
    completedAt: string
    status: AiUsageStatus
    failureMessage: string | null
  },
): void {
  if (!input.recordUsage) {
    return
  }

  const tokenBreakdown = buildGeminiTokenBreakdown(result.response?.usageMetadata)
  try {
    input.recordUsage({
      ...input.attribution,
      stage: input.stage,
      provider: GEMINI_PROVIDER,
      model: input.model,
      status: result.status,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      failureMessage: result.failureMessage,
      rawProviderMetadata: buildRawProviderMetadata(result.response),
      tokenBreakdown,
      pricingSnapshot: estimateAiUsageCost({
        provider: GEMINI_PROVIDER,
        modelId: input.model,
        effectiveDate: result.completedAt,
        tokenBreakdown,
        billingMode: input.attribution?.billingMode ?? 'interactive',
      }),
    })
  } catch {
    // Usage capture should not change OCR or quiz behavior.
  }
}

function buildRawProviderMetadata(response: GenerateContentResponse | null): Record<string, unknown> | null {
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

function applyModalityTokenCounts(
  tokenBreakdown: Partial<AiUsageTokenBreakdown>,
  details: ModalityTokenCount[] | undefined,
  fieldsByModality: Partial<Record<string, keyof AiUsageTokenBreakdown>>,
): void {
  details?.forEach((detail) => {
    const field = fieldsByModality[String(detail.modality ?? '').toUpperCase()]
    const tokenCount = normalizeTokenCount(detail.tokenCount)
    if (!field || tokenCount === null) {
      return
    }
    tokenBreakdown[field] = (tokenBreakdown[field] ?? 0) + tokenCount
  })
}

function normalizeTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function formatUsageFailureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Gemini call failed.'
}
