import type { GeminiQuizQuestion } from '../ai/geminiQuiz'
import type { BaselineQuestionResult, QuizAttempt, QuizQuestionReview } from '../../types/domain'
import { calculateActualWpm, calculateAdjustedWpm, clampWpm } from './pacing'

type QuizAttemptInput = {
  documentId: string
  readingSessionId: string | null
  startWordIndex: number
  endWordIndex: number
  wordCount: number
  durationSeconds: number
  comprehensionPercent: number
  currentTargetWpm: number
}

type QuizAttemptBuilderInput = QuizAttemptInput & {
  kind: QuizAttempt['kind']
  questionResults?: BaselineQuestionResult[]
  questions?: QuizQuestionReview[]
}

export function recommendCoachingWpm(currentTargetWpm: number, rawWpm: number, comprehensionPercent: number): number {
  const normalizedComprehension = Math.max(0, Math.min(100, comprehensionPercent))
  const baseWpm = currentTargetWpm > 0 ? currentTargetWpm : clampWpm(rawWpm)

  if (normalizedComprehension >= 80) {
    return clampWpm(baseWpm + 15)
  }

  if (normalizedComprehension >= 60) {
    return clampWpm(baseWpm)
  }

  return clampWpm(baseWpm - 20)
}

export function explainCoachingRecommendation(
  currentTargetWpm: number,
  rawWpm: number,
  comprehensionPercent: number,
  recommendedWpm: number,
): string {
  if (rawWpm <= 0 || comprehensionPercent <= 0) {
    return 'Need a completed quiz result to set a recommendation. Read a passage and use Test to measure comprehension.'
  }

  if (comprehensionPercent >= 80) {
    return `Strong comprehension (${comprehensionPercent}%). Try ${recommendedWpm} WPM for the next check.`
  }

  if (comprehensionPercent >= 60) {
    return `Solid comprehension (${comprehensionPercent}%). Keep the same target near ${currentTargetWpm} WPM.`
  }

  return `Comprehension dipped (${comprehensionPercent}%). Slow to ${recommendedWpm} WPM so understanding can catch up.`
}

export function scoreGeneratedQuizQuestions(
  questions: GeminiQuizQuestion[],
  answers: Record<string, string>,
): { comprehensionPercent: number; questionResults: BaselineQuestionResult[]; questions: QuizQuestionReview[] } {
  const questionResults = questions.map((question) => {
    const selectedOptionId = answers[question.id] ?? ''
    return {
      questionId: question.id,
      selectedOptionId,
      score: selectedOptionId === question.correctOptionId ? 1 : 0,
      maxScore: 1,
    }
  })
  const reviewQuestions = questions.map((question, index) => {
    const result = questionResults[index]
    return {
      questionId: question.id,
      kind: question.kind,
      prompt: question.prompt,
      options: question.options.map((option) => ({ id: option.id, label: option.label })),
      correctOptionId: question.correctOptionId,
      selectedOptionId: result.selectedOptionId,
      score: result.score,
      maxScore: result.maxScore,
    }
  })

  const earned = questionResults.reduce((total, result) => total + result.score, 0)
  const possible = questionResults.reduce((total, result) => total + result.maxScore, 0)

  return {
    comprehensionPercent: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    questionResults,
    questions: reviewQuestions,
  }
}

function buildQuizAttempt(input: QuizAttemptBuilderInput): QuizAttempt {
  const startWordIndex = Math.max(0, Math.round(input.startWordIndex))
  const endWordIndex = Math.max(startWordIndex, Math.round(input.endWordIndex))
  const wordCount = Math.max(0, Math.round(input.wordCount || endWordIndex - startWordIndex))
  const durationSeconds = Math.max(1, Math.round(input.durationSeconds))
  const comprehensionPercent = Math.max(0, Math.min(100, Math.round(input.comprehensionPercent)))
  const rawWpm = calculateActualWpm(wordCount, durationSeconds)
  const adjustedWpm = calculateAdjustedWpm(rawWpm, comprehensionPercent) ?? 0
  const recommendedWpm = recommendCoachingWpm(input.currentTargetWpm, rawWpm, comprehensionPercent)

  return {
    id: crypto.randomUUID(),
    documentId: input.documentId,
    readingSessionId: input.readingSessionId,
    kind: input.kind,
    startWordIndex,
    endWordIndex,
    wordCount,
    durationSeconds,
    targetWpm: input.currentTargetWpm,
    rawWpm,
    comprehensionPercent,
    adjustedWpm,
    recommendedWpm,
    explanation: explainCoachingRecommendation(input.currentTargetWpm, rawWpm, comprehensionPercent, recommendedWpm),
    questionResults: input.questionResults,
    questions: input.questions,
    createdAt: new Date().toISOString(),
  }
}

export function buildGeneratedQuizAttempt(
  input: QuizAttemptInput & { questionResults: BaselineQuestionResult[]; questions: QuizQuestionReview[] },
): QuizAttempt {
  return buildQuizAttempt({ ...input, kind: 'generated' })
}
