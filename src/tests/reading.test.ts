import { describe, expect, it } from 'vitest'
import { comprehensionBand, recommendedNextWpm } from '../lib/reading/comprehension'
import { calculateActualWpm, calculateAdjustedWpm, clampWpm, formatDuration } from '../lib/reading/pacing'
import { summarizeSessions } from '../lib/reading/stats'
import type { ReadingSession } from '../types/domain'

describe('reading math', () => {
  it('calculates WPM and comprehension-adjusted WPM', () => {
    expect(calculateActualWpm(500, 120)).toBe(250)
    expect(calculateAdjustedWpm(250, 80)).toBe(200)
    expect(calculateAdjustedWpm(250, null)).toBeNull()
  })

  it('clamps WPM and formats elapsed time', () => {
    expect(clampWpm(40)).toBe(80)
    expect(clampWpm(1200)).toBe(900)
    expect(formatDuration(125)).toBe('2:05')
  })

  it('turns comprehension into conservative next-step guidance', () => {
    expect(comprehensionBand(65)).toBe('review')
    expect(recommendedNextWpm(250, 95)).toBe(265)
    expect(recommendedNextWpm(250, 55)).toBe(225)
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
