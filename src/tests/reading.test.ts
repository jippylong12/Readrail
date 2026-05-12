import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BASELINE_QUESTIONS,
  getBaselineQuestions,
  recommendBaselineStartingWpm,
  scoreBaselineAnswers,
} from '../lib/reading/baseline'
import { comprehensionBand, recommendedNextWpm } from '../lib/reading/comprehension'
import {
  buildCoachingProgressSummary,
  buildCoachingRecommendation,
  buildGeneratedQuizAttempt,
  buildManualQuizAttempt,
  buildRetestQuizAttempt,
  recommendCoachingWpm,
  scoreGeneratedQuizQuestions,
} from '../lib/reading/coaching'
import {
  calculateActualWpm,
  calculateAdjustedWpm,
  clampWpm,
  formatDuration,
  roundWpmToNearestFive,
} from '../lib/reading/pacing'
import { summarizeSessions } from '../lib/reading/stats'
import type { ReadingSession } from '../types/domain'

describe('reading math', () => {
  it('calculates WPM and comprehension-adjusted WPM', () => {
    expect(calculateActualWpm(500, 120)).toBe(250)
    expect(calculateActualWpm(387, 60)).toBe(387)
    expect(calculateAdjustedWpm(250, 80)).toBe(200)
    expect(calculateAdjustedWpm(387, 80)).toBe(310)
    expect(calculateAdjustedWpm(250, null)).toBeNull()
  })

  it('clamps WPM and formats elapsed time', () => {
    expect(clampWpm(40)).toBe(80)
    expect(clampWpm(1200)).toBe(900)
    expect(roundWpmToNearestFive(386.7)).toBe(385)
    expect(roundWpmToNearestFive(388)).toBe(390)
    expect(formatDuration(125)).toBe('2:05')
  })

  it('turns comprehension into conservative next-step guidance', () => {
    expect(comprehensionBand(65)).toBe('review')
    expect(recommendedNextWpm(250, 95)).toBe(265)
    expect(recommendedNextWpm(250, 55)).toBe(225)
  })

  it('provides exactly five baseline questions across the required categories', () => {
    expect(DEFAULT_BASELINE_QUESTIONS).toHaveLength(5)
    expect(DEFAULT_BASELINE_QUESTIONS.every((question) => question.options.length === 5)).toBe(true)
    expect(DEFAULT_BASELINE_QUESTIONS.map((question) => question.kind)).toEqual([
      'main_idea',
      'detail',
      'sequence_cause',
      'inference',
      'confidence',
    ])
    expect(getBaselineQuestions('custom')).toHaveLength(0)
  })

  it('scores baseline answers deterministically', () => {
    const scoring = scoreBaselineAnswers(DEFAULT_BASELINE_QUESTIONS, {
      'main-idea': 'archive-practice',
      'detail-recall': 'brass-lantern',
      'sequence-cause': 'heard-boat',
      inference: 'knew-fog',
      confidence: 'confident-general',
    })

    expect(scoring.comprehensionPercent).toBe(88)
    expect(scoring.questionResults).toHaveLength(5)
  })

  it('recommends baseline WPM conservatively for low, medium, and high comprehension', () => {
    expect(recommendBaselineStartingWpm(250, 40)).toBe(90)
    expect(recommendBaselineStartingWpm(250, 80)).toBe(225)
    expect(recommendBaselineStartingWpm(250, 100)).toBe(250)
    expect(recommendBaselineStartingWpm(407, 95)).toBe(395)
  })

  it('summarizes reading sessions', () => {
    const sessions: ReadingSession[] = [
      {
        id: 'session-1',
        documentId: 'doc-1',
        mode: 'rail',
        targetWpm: 250,
        actualWpm: 240,
        adjustedWpm: 204,
        wordsRead: 480,
        durationSeconds: 120,
        startPosition: 0,
        endPosition: 480,
        pauseCount: 1,
        regressionCount: 0,
        comprehensionScore: 85,
        selfRating: 4,
        notes: '',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]

    expect(summarizeSessions(sessions)).toMatchObject({
      totalSessions: 1,
      totalWords: 480,
      averageWpm: 240,
      averageComprehension: 85,
    })
  })

  it('builds coaching attempts from generated quiz results', () => {
    const attempt = buildGeneratedQuizAttempt({
      documentId: 'doc-1',
      readingSessionId: null,
      startWordIndex: 100,
      endWordIndex: 400,
      wordCount: 300,
      durationSeconds: 90,
      comprehensionPercent: 82,
      currentTargetWpm: 240,
      questionResults: [],
      questions: [],
    })

    expect(attempt.kind).toBe('generated')
    expect(attempt.startWordIndex).toBe(100)
    expect(attempt.endWordIndex).toBe(400)
    expect(attempt.targetWpm).toBe(240)
    expect(attempt.rawWpm).toBe(200)
    expect(attempt.adjustedWpm).toBe(164)
    expect(attempt.recommendedWpm).toBe(240)
  })

  it('builds manual and retest coaching attempts without generated review data', () => {
    const manualAttempt = buildManualQuizAttempt({
      documentId: 'doc-1',
      readingSessionId: 'session-1',
      startWordIndex: 0,
      endWordIndex: 300,
      wordCount: 300,
      durationSeconds: 90,
      comprehensionPercent: 72,
      currentTargetWpm: 240,
    })
    const retestAttempt = buildRetestQuizAttempt({
      documentId: 'doc-1',
      startWordIndex: 0,
      endWordIndex: 600,
      wordCount: 600,
      durationSeconds: 180,
      comprehensionPercent: 91,
      currentTargetWpm: 1000,
    })

    expect(manualAttempt).toMatchObject({
      kind: 'manual',
      readingSessionId: 'session-1',
      rawWpm: 200,
      adjustedWpm: 144,
      recommendedWpm: 240,
      questionResults: [],
      questions: [],
    })
    expect(retestAttempt).toMatchObject({
      kind: 'retest',
      readingSessionId: null,
      targetWpm: 900,
      rawWpm: 200,
      adjustedWpm: 182,
      recommendedWpm: 900,
      questionResults: [],
      questions: [],
    })
  })

  it('scores generated quizzes and recommends conservative targets', () => {
    const scored = scoreGeneratedQuizQuestions(
      [
        {
          id: 'q1',
          kind: 'main_idea',
          prompt: 'What is the central point?',
          options: [
            { id: 'a', label: 'Central point' },
            { id: 'b', label: 'Distractor' },
            { id: 'c', label: 'Another distractor' },
            { id: 'd', label: 'Final distractor' },
          ],
          correctOptionId: 'a',
        },
        {
          id: 'q2',
          kind: 'inference',
          prompt: 'What can the reader infer?',
          options: [
            { id: 'a', label: 'Wrong inference' },
            { id: 'b', label: 'Right inference' },
            { id: 'c', label: 'Weak inference' },
            { id: 'd', label: 'Unsupported inference' },
          ],
          correctOptionId: 'b',
        },
      ],
      { q1: 'a', q2: 'c' },
    )

    expect(scored.comprehensionPercent).toBe(50)
    expect(scored.questionResults.map((result) => result.score)).toEqual([1, 0])
    expect(scored.questions[0]).toMatchObject({
      correctOptionId: 'a',
      selectedOptionId: 'a',
      score: 1,
    })
    expect(recommendCoachingWpm(240, 260, 50)).toBe(220)
  })

  it('keeps recommendations conservative until comprehension is stable', () => {
    expect(buildCoachingRecommendation(240, 240, 84)).toMatchObject({
      action: 'hold',
      recommendedWpm: 240,
    })
    expect(buildCoachingRecommendation(240, 240, 84, [buildAttempt({ id: 'previous', comprehensionPercent: 82 })])).toMatchObject({
      action: 'increase',
      recommendedWpm: 255,
    })
    expect(buildCoachingRecommendation(240, 240, 92)).toMatchObject({
      action: 'increase',
      recommendedWpm: 255,
    })
    expect(buildCoachingRecommendation(240, 240, 55).explanation).toContain('understanding can recover')
  })

  it('keeps coaching copy evidence-based when raw WPM is high but comprehension drops', () => {
    const lowComprehension = buildCoachingRecommendation(300, 800, 55)
    const developingComprehension = buildCoachingRecommendation(300, 800, 78)

    expect(lowComprehension).toMatchObject({
      action: 'reduce',
      recommendedWpm: 280,
    })
    expect(developingComprehension).toMatchObject({
      action: 'hold',
      recommendedWpm: 300,
    })
    expect(`${lowComprehension.explanation} ${lowComprehension.evidence.join(' ')}`).toMatch(/comprehension/i)
    expect(`${developingComprehension.explanation} ${developingComprehension.evidence.join(' ')}`).toMatch(/comprehension/i)
    expectNoUnrealisticCoachingClaims(lowComprehension)
    expectNoUnrealisticCoachingClaims(developingComprehension)
  })

  it('summarizes coaching trends, attempt kinds, reading volume, and streaks', () => {
    const attempts = [
      buildAttempt({
        id: 'latest',
        kind: 'manual',
        rawWpm: 250,
        adjustedWpm: 212,
        comprehensionPercent: 85,
        wordCount: 420,
        createdAt: '2026-05-12T12:00:00.000Z',
      }),
      buildAttempt({
        id: 'previous',
        kind: 'generated',
        rawWpm: 220,
        adjustedWpm: 176,
        comprehensionPercent: 80,
        wordCount: 360,
        createdAt: '2026-05-11T12:00:00.000Z',
      }),
      buildAttempt({
        id: 'retest',
        kind: 'retest',
        rawWpm: 210,
        adjustedWpm: 189,
        comprehensionPercent: 90,
        wordCount: 500,
        createdAt: '2026-05-01T12:00:00.000Z',
      }),
    ]
    const sessions = [
      buildSession({ id: 'today', wordsRead: 420, startedAt: '2026-05-12T09:00:00.000Z' }),
      buildSession({ id: 'yesterday', wordsRead: 360, startedAt: '2026-05-11T09:00:00.000Z' }),
      buildSession({ id: 'old', wordsRead: 1000, startedAt: '2026-04-28T09:00:00.000Z' }),
    ]

    const summary = buildCoachingProgressSummary(attempts, sessions, 240, new Date('2026-05-12T18:00:00.000Z'))

    expect(summary.attempts).toEqual({
      total: 3,
      generated: 1,
      manual: 1,
      retest: 1,
    })
    expect(summary.trends.rawWpm).toMatchObject({ current: 250, previous: 220, delta: 30, direction: 'up' })
    expect(summary.trends.comprehension).toMatchObject({ current: 85, previous: 80, delta: 5, direction: 'up' })
    expect(summary.readingVolume).toMatchObject({
      totalWords: 1780,
      recentWords: 780,
      totalSessions: 3,
      streakDays: 2,
    })
    expect(summary.recommendation).toMatchObject({
      action: 'increase',
      recommendedWpm: 255,
    })
  })
})

function buildAttempt(overrides: Partial<ReturnType<typeof buildGeneratedQuizAttempt>> = {}) {
  return {
    id: 'attempt-1',
    documentId: 'doc-1',
    readingSessionId: 'session-1',
    kind: 'generated' as const,
    scopeType: 'document' as const,
    scopeLabel: null,
    chapterId: null,
    chapterTitle: null,
    pageIds: [],
    pageNumbers: [],
    sourcePageNumbers: [],
    startWordIndex: 0,
    endWordIndex: 300,
    wordCount: 300,
    durationSeconds: 90,
    targetWpm: 240,
    rawWpm: 200,
    comprehensionPercent: 80,
    adjustedWpm: 160,
    recommendedWpm: 240,
    explanation: 'Hold pace.',
    questionResults: [],
    questions: [],
    createdAt: '2026-05-10T09:00:00.000Z',
    ...overrides,
  }
}

function buildSession(overrides: Partial<ReadingSession> = {}): ReadingSession {
  return {
    id: 'session-1',
    documentId: 'doc-1',
    mode: 'rail',
    targetWpm: 240,
    actualWpm: 200,
    adjustedWpm: 160,
    wordsRead: 300,
    durationSeconds: 90,
    startPosition: 0,
    endPosition: 300,
    pauseCount: 0,
    regressionCount: 0,
    comprehensionScore: 80,
    selfRating: null,
    notes: '',
    startedAt: '2026-05-10T09:00:00.000Z',
    endedAt: '2026-05-10T09:01:30.000Z',
    ...overrides,
  }
}

function expectNoUnrealisticCoachingClaims(recommendation: ReturnType<typeof buildCoachingRecommendation>): void {
  const text = `${recommendation.explanation} ${recommendation.evidence.join(' ')}`.toLowerCase()

  expect(text).not.toMatch(/speed-reading mastery|double your speed|triple your speed|guaranteed|raw speed/)
  expect(text).not.toMatch(/fast(er)? reader/)
}
