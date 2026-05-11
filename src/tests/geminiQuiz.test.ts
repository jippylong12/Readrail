import { describe, expect, it } from 'vitest'
import { normalizeGeminiQuiz } from '../lib/ai/geminiQuiz'

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
})
