import type { AiBillingMode, AiPricingSnapshot, AiUsageTokenBreakdown } from '../../types/domain'

export type AiPricingEntry = {
  version: 'v1'
  provider: string
  modelId: string
  effectiveDate: string
  currency: string
  inputRatePerMillionTokens: number
  outputRatePerMillionTokens: number
  thinkingRatePerMillionTokens: number | null
  outputIncludesThinkingTokens: boolean
}

export type AiPricingLookupInput = {
  provider: string
  modelId: string
  effectiveDate: string | Date
}

export type AiCostEstimateInput = {
  provider: string
  modelId: string
  effectiveDate: string | Date
  tokenBreakdown: Partial<AiUsageTokenBreakdown> | null | undefined
  billingMode?: AiBillingMode
}

const USD = 'USD'
const GOOGLE = 'google'
const GEMINI_PRICING_EFFECTIVE_DATE = '2026-05-12'

export const AI_PRICING_TABLE_V1: AiPricingEntry[] = [
  {
    version: 'v1',
    provider: GOOGLE,
    modelId: 'gemini-3.1-flash-lite',
    effectiveDate: GEMINI_PRICING_EFFECTIVE_DATE,
    currency: USD,
    inputRatePerMillionTokens: 0.25,
    outputRatePerMillionTokens: 1.5,
    thinkingRatePerMillionTokens: null,
    outputIncludesThinkingTokens: true,
  },
  {
    version: 'v1',
    provider: GOOGLE,
    modelId: 'gemini-3.1-flash-lite-preview',
    effectiveDate: GEMINI_PRICING_EFFECTIVE_DATE,
    currency: USD,
    inputRatePerMillionTokens: 0.25,
    outputRatePerMillionTokens: 1.5,
    thinkingRatePerMillionTokens: null,
    outputIncludesThinkingTokens: true,
  },
  {
    version: 'v1',
    provider: GOOGLE,
    modelId: 'gemini-3-flash-preview',
    effectiveDate: GEMINI_PRICING_EFFECTIVE_DATE,
    currency: USD,
    inputRatePerMillionTokens: 0.5,
    outputRatePerMillionTokens: 3,
    thinkingRatePerMillionTokens: null,
    outputIncludesThinkingTokens: true,
  },
]

export function lookupAiPricing(input: AiPricingLookupInput): AiPricingEntry | null {
  const provider = normalizePricingKey(input.provider)
  const modelId = normalizePricingKey(input.modelId)
  const effectiveDate = normalizePricingDate(input.effectiveDate)

  return (
    AI_PRICING_TABLE_V1.filter(
      (entry) =>
        normalizePricingKey(entry.provider) === provider &&
        normalizePricingKey(entry.modelId) === modelId &&
        entry.effectiveDate <= effectiveDate,
    ).sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0] ?? null
  )
}

export function estimateAiUsageCost(input: AiCostEstimateInput): AiPricingSnapshot {
  const billingMode = input.billingMode ?? 'interactive'
  const costMultiplier = billingMode === 'batch' ? 0.5 : 1
  const pricing = lookupAiPricing(input)
  if (!pricing) {
    return buildUnknownSnapshot(input.modelId, null, billingMode, costMultiplier)
  }

  const inputTokens = normalizeTokenCount(input.tokenBreakdown?.inputTokens)
  const outputTokens = normalizeTokenCount(input.tokenBreakdown?.outputTokens)
  const thinkingTokens = normalizeTokenCount(input.tokenBreakdown?.thinkingTokens)
  const canEstimateBillableOutput = outputTokens !== null || thinkingTokens !== null

  if (inputTokens === null || !canEstimateBillableOutput) {
    return buildUnknownSnapshot(input.modelId, pricing, billingMode, costMultiplier)
  }

  const estimatedInputCost = estimateTokenCost(inputTokens, pricing.inputRatePerMillionTokens, costMultiplier)
  const estimatedOutputCost =
    outputTokens === null ? null : estimateTokenCost(outputTokens, pricing.outputRatePerMillionTokens, costMultiplier)
  const thinkingRatePerMillionTokens = getThinkingRate(pricing, outputTokens, thinkingTokens)
  const estimatedThinkingCost =
    thinkingTokens === null || thinkingRatePerMillionTokens === null
      ? null
      : estimateTokenCost(thinkingTokens, thinkingRatePerMillionTokens, costMultiplier)
  const estimatedTotalCost =
    estimatedInputCost + (estimatedOutputCost ?? 0) + (estimatedThinkingCost ?? 0)

  return {
    effectiveDate: pricing.effectiveDate,
    modelId: pricing.modelId,
    currency: pricing.currency,
    billingMode,
    costMultiplier,
    inputRatePerMillionTokens: pricing.inputRatePerMillionTokens,
    outputRatePerMillionTokens: pricing.outputRatePerMillionTokens,
    thinkingRatePerMillionTokens,
    estimatedInputCost,
    estimatedOutputCost,
    estimatedThinkingCost,
    estimatedTotalCost,
    confidence: 'estimated',
  }
}

function getThinkingRate(
  pricing: AiPricingEntry,
  outputTokens: number | null,
  thinkingTokens: number | null,
): number | null {
  if (thinkingTokens === null) {
    return null
  }
  if (pricing.thinkingRatePerMillionTokens !== null) {
    return pricing.thinkingRatePerMillionTokens
  }
  if (pricing.outputIncludesThinkingTokens && outputTokens !== null) {
    return null
  }
  return pricing.outputRatePerMillionTokens
}

function buildUnknownSnapshot(
  modelId: string,
  pricing: AiPricingEntry | null,
  billingMode: AiBillingMode,
  costMultiplier: number,
): AiPricingSnapshot {
  return {
    effectiveDate: pricing?.effectiveDate ?? null,
    modelId: pricing?.modelId ?? modelId,
    currency: pricing?.currency ?? null,
    billingMode,
    costMultiplier,
    inputRatePerMillionTokens: pricing?.inputRatePerMillionTokens ?? null,
    outputRatePerMillionTokens: pricing?.outputRatePerMillionTokens ?? null,
    thinkingRatePerMillionTokens: pricing?.thinkingRatePerMillionTokens ?? null,
    estimatedInputCost: null,
    estimatedOutputCost: null,
    estimatedThinkingCost: null,
    estimatedTotalCost: null,
    confidence: 'unknown',
  }
}

function estimateTokenCost(tokens: number, ratePerMillionTokens: number, costMultiplier: number): number {
  return (tokens / 1_000_000) * ratePerMillionTokens * costMultiplier
}

function normalizeTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizePricingKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizePricingDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}
