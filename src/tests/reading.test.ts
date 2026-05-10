import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BASELINE_QUESTIONS,
  getBaselineQuestions,
  recommendBaselineStartingWpm,
  scoreBaselineAnswers,
} from '../lib/reading/baseline'
import { comprehensionBand, recommendedNextWpm } from '../lib/reading/comprehension'
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
})
