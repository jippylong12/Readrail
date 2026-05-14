import { describe, expect, it } from 'vitest'
import { estimateAiUsageCost, lookupAiPricing } from '../lib/ai/pricing'

describe('AI pricing lookup', () => {
  it('selects pricing by provider, model id, and effective date', () => {
    expect(
      lookupAiPricing({
        provider: 'google',
        modelId: 'gemini-3.1-flash-lite',
        effectiveDate: '2026-05-12T18:00:00.000Z',
      }),
    ).toMatchObject({
      version: 'v1',
      provider: 'google',
      modelId: 'gemini-3.1-flash-lite',
      effectiveDate: '2026-05-12',
      currency: 'USD',
      inputRatePerMillionTokens: 0.25,
      outputRatePerMillionTokens: 1.5,
      thinkingRatePerMillionTokens: null,
    })
  })

  it('returns null before a model pricing row is effective', () => {
    expect(
      lookupAiPricing({
        provider: 'google',
        modelId: 'gemini-3.1-flash-lite',
        effectiveDate: '2026-05-11',
      }),
    ).toBeNull()
  })

  it('returns null for unknown providers and models', () => {
    expect(
      lookupAiPricing({
        provider: 'openai',
        modelId: 'gemini-3.1-flash-lite',
        effectiveDate: '2026-05-12',
      }),
    ).toBeNull()
    expect(
      lookupAiPricing({
        provider: 'google',
        modelId: 'unknown-model',
        effectiveDate: '2026-05-12',
      }),
    ).toBeNull()
  })
})

describe('AI cost estimation', () => {
  it('calculates input, output, and total estimated cost with pricing snapshot fields', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'gemini-3.1-flash-lite',
      effectiveDate: '2026-05-12',
      tokenBreakdown: {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      },
    })

    expect(snapshot).toMatchObject({
      effectiveDate: '2026-05-12',
      modelId: 'gemini-3.1-flash-lite',
      currency: 'USD',
      inputRatePerMillionTokens: 0.25,
      outputRatePerMillionTokens: 1.5,
      thinkingRatePerMillionTokens: null,
      estimatedInputCost: 0.25,
      estimatedOutputCost: 0.75,
      estimatedThinkingCost: null,
      confidence: 'estimated',
    })
    expect(snapshot.estimatedTotalCost).toBeCloseTo(1)
  })

  it('does not double-count Gemini thinking tokens when output tokens already include them', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'gemini-3-flash-preview',
      effectiveDate: '2026-05-12',
      tokenBreakdown: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        thinkingTokens: 250_000,
      },
    })

    expect(snapshot.estimatedInputCost).toBeCloseTo(0.5)
    expect(snapshot.estimatedOutputCost).toBeCloseTo(3)
    expect(snapshot.thinkingRatePerMillionTokens).toBeNull()
    expect(snapshot.estimatedThinkingCost).toBeNull()
    expect(snapshot.estimatedTotalCost).toBeCloseTo(3.5)
    expect(snapshot.confidence).toBe('estimated')
  })

  it('estimates thinking tokens at the output rate when output tokens are missing', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'gemini-3-flash-preview',
      effectiveDate: '2026-05-12',
      tokenBreakdown: {
        inputTokens: 1_000_000,
        thinkingTokens: 250_000,
      },
    })

    expect(snapshot.outputRatePerMillionTokens).toBe(3)
    expect(snapshot.thinkingRatePerMillionTokens).toBe(3)
    expect(snapshot.estimatedInputCost).toBeCloseTo(0.5)
    expect(snapshot.estimatedOutputCost).toBeNull()
    expect(snapshot.estimatedThinkingCost).toBeCloseTo(0.75)
    expect(snapshot.estimatedTotalCost).toBeCloseTo(1.25)
    expect(snapshot.confidence).toBe('estimated')
  })

  it('returns unknown with pricing rates but null costs when token metadata is incomplete', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'gemini-3.1-flash-lite-preview',
      effectiveDate: '2026-05-12',
      tokenBreakdown: {
        inputTokens: 1000,
      },
    })

    expect(snapshot).toMatchObject({
      effectiveDate: '2026-05-12',
      modelId: 'gemini-3.1-flash-lite-preview',
      currency: 'USD',
      inputRatePerMillionTokens: 0.25,
      outputRatePerMillionTokens: 1.5,
      estimatedInputCost: null,
      estimatedOutputCost: null,
      estimatedThinkingCost: null,
      estimatedTotalCost: null,
      confidence: 'unknown',
    })
  })

  it('returns unknown with null rates and costs when pricing is missing', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'unknown-model',
      effectiveDate: '2026-05-12',
      tokenBreakdown: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
    })

    expect(snapshot).toEqual({
      effectiveDate: null,
      modelId: 'unknown-model',
      currency: null,
      billingMode: 'interactive',
      costMultiplier: 1,
      inputRatePerMillionTokens: null,
      outputRatePerMillionTokens: null,
      thinkingRatePerMillionTokens: null,
      estimatedInputCost: null,
      estimatedOutputCost: null,
      estimatedThinkingCost: null,
      estimatedTotalCost: null,
      confidence: 'unknown',
    })
  })

  it('applies the Gemini batch discount to estimated costs', () => {
    const snapshot = estimateAiUsageCost({
      provider: 'google',
      modelId: 'gemini-3.1-flash-lite',
      effectiveDate: '2026-05-12',
      billingMode: 'batch',
      tokenBreakdown: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
    })

    expect(snapshot.billingMode).toBe('batch')
    expect(snapshot.costMultiplier).toBe(0.5)
    expect(snapshot.estimatedInputCost).toBeCloseTo(0.125)
    expect(snapshot.estimatedOutputCost).toBeCloseTo(0.75)
    expect(snapshot.estimatedTotalCost).toBeCloseTo(0.875)
  })
})
