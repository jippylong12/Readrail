import { describe, expect, it, vi } from 'vitest'
import { GEMINI_QUIZ_MODEL, generateQuizFromReading, normalizeGeminiQuiz } from '../lib/ai/geminiQuiz'

describe('Gemini quiz normalization', () => {
  it('normalizes generated quiz payloads for the requested question count', () => {
    const quiz = normalizeGeminiQuiz(
      {
        title: 'Practice check',
        questions: [0, 1, 2, 3].map((index) => ({
          id: `Question ${index + 1}`,
          kind: 'main_idea',
          prompt: `Prompt ${index + 1}`,
          correctOptionIndex: 1,
          options: ['A', 'B', 'C', 'D'],
        })),
      },
      'Fallback title',
      4,
    )

    expect(quiz.title).toBe('Practice check')
    expect(quiz.questions).toHaveLength(4)
    expect(quiz.questions[0].id).toBe('question-1')
    expect(quiz.questions[0].correctOptionId).toBe('question-1-option-2')
  })

  it('rejects generated questions with invalid answer keys', () => {
    expect(() =>
      normalizeGeminiQuiz(
        {
          questions: [
            {
              id: 'q1',
              kind: 'detail',
              prompt: 'Prompt',
              correctOptionId: 'missing',
              options: [
                { id: 'a', label: 'A' },
                { id: 'b', label: 'B' },
                { id: 'c', label: 'C' },
                { id: 'd', label: 'D' },
              ],
            },
          ],
        },
        'Fallback title',
        1,
      ),
    ).toThrow('valid correct answer')
  })

  it('rejects text-trivia questions that are not comprehension checks', () => {
    expect(() =>
      normalizeGeminiQuiz(
        {
          questions: [
            {
              id: 'q1',
              kind: 'detail',
              prompt: 'What is the final word present in the provided text?',
              correctOptionIndex: 1,
              options: ['My', 'mother', 'had', 'a'],
            },
          ],
        },
        'Fallback title',
        1,
      ),
    ).toThrow('text-trivia')
  })

  it('rejects duplicate answer options', () => {
    expect(() =>
      normalizeGeminiQuiz(
        {
          questions: [
            {
              id: 'q1',
              kind: 'inference',
              prompt: 'What can the reader infer about the narrator?',
              correctOptionIndex: 0,
              options: ['They are worried.', 'They are worried.', 'They are excited.', 'They are absent.'],
            },
          ],
        },
        'Fallback title',
        1,
      ),
    ).toThrow('distinct options')
  })

  it('records generated quiz usage with Gemini token metadata', async () => {
    const generateContent = vi.fn().mockResolvedValueOnce(buildQuizResponse('quiz-response'))
    const recordUsage = vi.fn()

    const quiz = await generateQuizFromReading('api-key', 'Practice check', 'A short reading passage.', 120, {
      client: { models: { generateContent } },
      usageAttribution: {
        documentId: 'doc-quiz',
      },
      recordUsage,
    })

    expect(quiz.questions).toHaveLength(2)
    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-quiz',
      stage: 'generated_quiz',
      provider: 'google',
      model: GEMINI_QUIZ_MODEL,
      status: 'succeeded',
      rawProviderMetadata: {
        responseId: 'quiz-response',
      },
      tokenBreakdown: {
        inputTokens: 90,
        outputTokens: 30,
        thinkingTokens: 4,
        totalTokens: 124,
        cachedInputTokens: 6,
        textInputTokens: 90,
        textOutputTokens: 30,
      },
      pricingSnapshot: {
        modelId: GEMINI_QUIZ_MODEL,
        confidence: 'estimated',
      },
    })
  })

  it('records unknown-cost generated quiz usage when metadata is missing', async () => {
    const generateContent = vi.fn().mockResolvedValueOnce({
      text: JSON.stringify(buildRawQuiz(2)),
      responseId: 'quiz-no-usage',
    })
    const recordUsage = vi.fn()

    await generateQuizFromReading('api-key', 'Practice check', 'A short reading passage.', 120, {
      client: { models: { generateContent } },
      recordUsage,
    })

    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      stage: 'generated_quiz',
      status: 'succeeded',
      rawProviderMetadata: {
        responseId: 'quiz-no-usage',
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

  it('records failed generated quiz usage when the provider rejects', async () => {
    const generateContent = vi.fn().mockRejectedValueOnce(new Error('quiz provider unavailable'))
    const recordUsage = vi.fn()

    await expect(
      generateQuizFromReading('api-key', 'Practice check', 'A short reading passage.', 120, {
        client: { models: { generateContent } },
        recordUsage,
      }),
    ).rejects.toThrow('quiz provider unavailable')

    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      stage: 'generated_quiz',
      status: 'failed',
      failureMessage: 'quiz provider unavailable',
      rawProviderMetadata: null,
      pricingSnapshot: {
        confidence: 'unknown',
      },
    })
  })

  it('records failed generated quiz usage when normalization rejects the provider response', async () => {
    const generateContent = vi.fn().mockResolvedValueOnce({
      text: JSON.stringify({ title: 'Bad quiz', questions: [] }),
      responseId: 'quiz-bad-shape',
      usageMetadata: {
        promptTokenCount: 90,
        candidatesTokenCount: 30,
        totalTokenCount: 120,
      },
    })
    const recordUsage = vi.fn()

    await expect(
      generateQuizFromReading('api-key', 'Practice check', 'A short reading passage.', 120, {
        client: { models: { generateContent } },
        recordUsage,
      }),
    ).rejects.toThrow('Gemini did not return any quiz questions.')

    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      stage: 'generated_quiz',
      status: 'failed',
      failureMessage: 'Gemini did not return any quiz questions.',
      rawProviderMetadata: {
        responseId: 'quiz-bad-shape',
      },
      tokenBreakdown: {
        inputTokens: 90,
        outputTokens: 30,
        totalTokens: 120,
      },
    })
  })
})

function buildQuizResponse(responseId: string) {
  return {
    text: JSON.stringify(buildRawQuiz(2)),
    responseId,
    modelVersion: GEMINI_QUIZ_MODEL,
    createTime: '2026-05-12T10:00:00.000Z',
    usageMetadata: {
      promptTokenCount: 90,
      candidatesTokenCount: 30,
      thoughtsTokenCount: 4,
      totalTokenCount: 124,
      cachedContentTokenCount: 6,
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 90 }],
      candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 30 }],
    },
  }
}

function buildRawQuiz(questionCount: number) {
  return {
    title: 'Practice check',
    questions: Array.from({ length: questionCount }, (_, index) => ({
      id: `q${index + 1}`,
      kind: index === 0 ? 'main_idea' : 'inference',
      prompt:
        index === 0
          ? 'What is the main point of the reading?'
          : 'What can the reader reasonably infer from the reading?',
      correctOptionIndex: 1,
      options: ['A plausible answer.', 'The supported answer.', 'Another plausible answer.', 'A final plausible answer.'],
    })),
  }
}
