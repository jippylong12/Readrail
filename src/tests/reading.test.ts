import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BASELINE_QUESTIONS,
  getBaselineQuestions,
  recommendBaselineStartingWpm,
  scoreBaselineAnswers,
} from '../lib/reading/baseline'
import { comprehensionBand, recommendedNextWpm } from '../lib/reading/comprehension'
import {
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
    expect(attempt.recommendedWpm).toBe(255)
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
})
