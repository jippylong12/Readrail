import type { GeminiQuizQuestion } from '../ai/geminiQuiz'
import type { BaselineQuestionResult, QuizAttempt, QuizQuestionReview, ReadingScopeType, ReadingSession } from '../../types/domain'
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
  scopeType?: ReadingScopeType
  scopeLabel?: string | null
  chapterId?: string | null
  chapterTitle?: string | null
  pageIds?: string[]
  pageNumbers?: number[]
  sourcePageNumbers?: Array<number | null>
  recentAttempts?: QuizAttempt[]
}

type QuizAttemptBuilderInput = QuizAttemptInput & {
  kind: QuizAttempt['kind']
  questionResults?: BaselineQuestionResult[]
  questions?: QuizQuestionReview[]
}

export type CoachingRecommendationAction = 'check' | 'reduce' | 'hold' | 'increase'

export type CoachingRecommendation = {
  action: CoachingRecommendationAction
  recommendedWpm: number
  explanation: string
  evidence: string[]
}

export type CoachingTrendMetric = {
  current: number | null
  previous: number | null
  delta: number | null
  direction: 'up' | 'down' | 'flat' | 'none'
}

export type CoachingProgressSummary = {
  attempts: {
    total: number
    generated: number
    manual: number
    retest: number
  }
  latestAttempt: QuizAttempt | null
  previousAttempt: QuizAttempt | null
  recommendation: CoachingRecommendation
  trends: {
    rawWpm: CoachingTrendMetric
    adjustedWpm: CoachingTrendMetric
    comprehension: CoachingTrendMetric
    wordsTested: CoachingTrendMetric
  }
  readingVolume: {
    totalWords: number
    recentWords: number
    totalSessions: number
    streakDays: number
  }
}

export function recommendCoachingWpm(
  currentTargetWpm: number,
  rawWpm: number,
  comprehensionPercent: number,
  recentAttempts: QuizAttempt[] = [],
): number {
  return buildCoachingRecommendation(currentTargetWpm, rawWpm, comprehensionPercent, recentAttempts).recommendedWpm
}

export function buildCoachingRecommendation(
  currentTargetWpm: number,
  rawWpm: number,
  comprehensionPercent: number,
  recentAttempts: QuizAttempt[] = [],
): CoachingRecommendation {
  const normalizedComprehension = Math.max(0, Math.min(100, comprehensionPercent))
  const baseWpm = currentTargetWpm > 0 ? currentTargetWpm : clampWpm(rawWpm)

  if (rawWpm <= 0 || normalizedComprehension <= 0) {
    return {
      action: 'check',
      recommendedWpm: clampWpm(baseWpm),
      explanation: 'Need a completed comprehension check before changing pace.',
      evidence: ['No usable comprehension result is available yet.'],
    }
  }

  if (normalizedComprehension < 60) {
    const recommendedWpm = clampWpm(baseWpm - 20)
    return {
      action: 'reduce',
      recommendedWpm,
      explanation: `Comprehension dipped to ${normalizedComprehension}%. Slow to ${recommendedWpm} WPM for the next check so understanding can recover.`,
      evidence: [
        `${normalizedComprehension}% comprehension is below the 60% recovery threshold.`,
        `The recommendation reduces the current target by 20 WPM.`,
      ],
    }
  }

  if (normalizedComprehension < 80) {
    const recommendedWpm = clampWpm(baseWpm)
    return {
      action: 'hold',
      recommendedWpm,
      explanation: `Comprehension is ${normalizedComprehension}%. Hold ${recommendedWpm} WPM and practice this range before changing pace.`,
      evidence: [
        `${normalizedComprehension}% comprehension is practice-stabilization evidence.`,
        'A speed increase waits until comprehension is steadier.',
      ],
    }
  }

  if (normalizedComprehension < 90 && !hasRecentStableComprehension(recentAttempts)) {
    const recommendedWpm = clampWpm(baseWpm)
    return {
      action: 'hold',
      recommendedWpm,
      explanation: `Comprehension held at ${normalizedComprehension}%. Keep ${recommendedWpm} WPM until another check confirms it feels stable.`,
      evidence: [
        `${normalizedComprehension}% comprehension is solid, but one result is not enough for a speed increase.`,
        'Another recent check at 80% or higher would support a small increase.',
      ],
    }
  }

  const recommendedWpm = clampWpm(baseWpm + 15)
  const stableEvidence =
    normalizedComprehension >= 90
      ? `${normalizedComprehension}% comprehension is strong enough for a small increase.`
      : 'Recent checks show comprehension staying at 80% or higher.'

  return {
    action: 'increase',
    recommendedWpm,
    explanation: `Comprehension stayed strong at ${normalizedComprehension}%. Try a small increase to ${recommendedWpm} WPM for the next practice segment.`,
    evidence: [
      stableEvidence,
      'The recommendation only adds 15 WPM.',
    ],
  }
}

export function explainCoachingRecommendation(
  currentTargetWpm: number,
  rawWpm: number,
  comprehensionPercent: number,
  recommendedWpm: number,
): string {
  const recommendation = buildCoachingRecommendation(currentTargetWpm, rawWpm, comprehensionPercent)
  return recommendation.recommendedWpm === recommendedWpm
    ? recommendation.explanation
    : `Comprehension is ${Math.max(0, Math.min(100, comprehensionPercent))}%. Use ${recommendedWpm} WPM for the next check.`
}

export function buildCoachingProgressSummary(
  quizAttempts: QuizAttempt[],
  sessions: ReadingSession[],
  fallbackRecommendedWpm: number,
  now: Date = new Date(),
): CoachingProgressSummary {
  const attempts = quizAttempts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const sortedSessions = sessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const [latestAttempt, previousAttempt = null] = attempts
  const recommendation = latestAttempt
    ? buildCoachingRecommendation(
        latestAttempt.targetWpm,
        latestAttempt.rawWpm,
        latestAttempt.comprehensionPercent,
        attempts.slice(1),
      )
    : {
        action: 'check' as const,
        recommendedWpm: clampWpm(fallbackRecommendedWpm),
        explanation: 'Complete a comprehension check to get a pace recommendation.',
        evidence: ['Read a segment, then use Test to record comprehension.'],
      }

  return {
    attempts: {
      total: attempts.length,
      generated: attempts.filter((attempt) => attempt.kind === 'generated').length,
      manual: attempts.filter((attempt) => attempt.kind === 'manual').length,
      retest: attempts.filter((attempt) => attempt.kind === 'retest').length,
    },
    latestAttempt: latestAttempt ?? null,
    previousAttempt,
    recommendation,
    trends: {
      rawWpm: buildTrendMetric(latestAttempt?.rawWpm ?? null, previousAttempt?.rawWpm ?? null),
      adjustedWpm: buildTrendMetric(latestAttempt?.adjustedWpm ?? null, previousAttempt?.adjustedWpm ?? null),
      comprehension: buildTrendMetric(
        latestAttempt?.comprehensionPercent ?? null,
        previousAttempt?.comprehensionPercent ?? null,
      ),
      wordsTested: buildTrendMetric(latestAttempt?.wordCount ?? null, previousAttempt?.wordCount ?? null),
    },
    readingVolume: {
      totalWords: sortedSessions.reduce((sum, session) => sum + session.wordsRead, 0),
      recentWords: calculateRecentWords(sortedSessions, now),
      totalSessions: sortedSessions.length,
      streakDays: calculateSessionStreakDays(sortedSessions, now),
    },
  }
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
  const targetWpm = clampWpm(input.currentTargetWpm)
  const rawWpm = calculateActualWpm(wordCount, durationSeconds)
  const adjustedWpm = calculateAdjustedWpm(rawWpm, comprehensionPercent) ?? 0
  const recommendation = buildCoachingRecommendation(targetWpm, rawWpm, comprehensionPercent, input.recentAttempts)

  return {
    id: crypto.randomUUID(),
    documentId: input.documentId,
    readingSessionId: input.readingSessionId,
    kind: input.kind,
    scopeType: input.scopeType ?? 'document',
    scopeLabel: input.scopeLabel ?? null,
    chapterId: input.chapterId ?? null,
    chapterTitle: input.chapterTitle ?? null,
    pageIds: input.pageIds ?? [],
    pageNumbers: input.pageNumbers ?? [],
    sourcePageNumbers: input.sourcePageNumbers ?? [],
    startWordIndex,
    endWordIndex,
    wordCount,
    durationSeconds,
    targetWpm,
    rawWpm,
    comprehensionPercent,
    adjustedWpm,
    recommendedWpm: recommendation.recommendedWpm,
    explanation: recommendation.explanation,
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

export function buildManualQuizAttempt(input: QuizAttemptInput): QuizAttempt {
  return buildQuizAttempt({ ...input, kind: 'manual', questionResults: [], questions: [] })
}

export function buildRetestQuizAttempt(input: Omit<QuizAttemptInput, 'readingSessionId'>): QuizAttempt {
  return buildQuizAttempt({ ...input, readingSessionId: null, kind: 'retest', questionResults: [], questions: [] })
}

function hasRecentStableComprehension(recentAttempts: QuizAttempt[]): boolean {
  return recentAttempts
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .some((attempt) => attempt.comprehensionPercent >= 80)
}

function buildTrendMetric(current: number | null, previous: number | null): CoachingTrendMetric {
  if (current === null) {
    return {
      current: null,
      previous: null,
      delta: null,
      direction: 'none',
    }
  }

  if (previous === null) {
    return {
      current,
      previous: null,
      delta: null,
      direction: 'none',
    }
  }

  const delta = Math.round((current - previous) * 10) / 10
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  }
}

function calculateRecentWords(sessions: ReadingSession[], now: Date): number {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 6)
  const cutoffDay = cutoff.toISOString().slice(0, 10)

  return sessions
    .filter((session) => session.startedAt.slice(0, 10) >= cutoffDay)
    .reduce((sum, session) => sum + session.wordsRead, 0)
}

function calculateSessionStreakDays(sessions: ReadingSession[], now: Date): number {
  const days = new Set(sessions.map((session) => session.startedAt.slice(0, 10)))
  let streak = 0
  const cursor = new Date(now)

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}
