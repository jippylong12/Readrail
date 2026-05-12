// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeQuizAttemptsForPersistence } from '../app/store'
import type { QuizAttempt, ReadingSession } from '../types/domain'

describe('quiz attempt store migration', () => {
  it('seeds durable scope metadata from linked reading sessions', () => {
    const session: ReadingSession = {
      id: 'session-1',
      documentId: 'doc-1',
      scopeType: 'pages',
      scopeLabel: 'Introduction, pages 1-2',
      chapterId: 'chapter-intro',
      chapterTitle: 'Introduction',
      pageIds: ['page-1', 'page-2'],
      pageNumbers: [1, 2],
      sourcePageNumbers: [10, 11],
      mode: 'rail',
      targetWpm: 240,
      actualWpm: 210,
      adjustedWpm: 168,
      wordsRead: 210,
      durationSeconds: 60,
      startPosition: 20,
      endPosition: 230,
      pauseCount: 0,
      regressionCount: 0,
      comprehensionScore: 80,
      selfRating: null,
      notes: '',
      startedAt: '2026-05-12T10:00:00.000Z',
      endedAt: '2026-05-12T10:01:00.000Z',
    }
    const legacyAttempt = {
      id: 'attempt-legacy',
      documentId: 'doc-1',
      readingSessionId: 'session-1',
      kind: 'generated',
      startWordIndex: 20,
      endWordIndex: 230,
      wordCount: 210,
      durationSeconds: 60,
      targetWpm: 240,
      rawWpm: 210,
      comprehensionPercent: 80,
      adjustedWpm: 168,
      recommendedWpm: 255,
      explanation: 'Try a small increase.',
      createdAt: '2026-05-12T10:01:00.000Z',
    } as unknown as QuizAttempt

    const [normalized] = normalizeQuizAttemptsForPersistence([legacyAttempt], [session], 250)

    expect(normalized).toMatchObject({
      scopeType: 'pages',
      scopeLabel: 'Introduction, pages 1-2',
      chapterId: 'chapter-intro',
      chapterTitle: 'Introduction',
      pageIds: ['page-1', 'page-2'],
      pageNumbers: [1, 2],
      sourcePageNumbers: [10, 11],
      questionResults: [],
      questions: [],
    })
  })

  it('keeps manual and retest kinds while defaulting missing scope to document', () => {
    const manualAttempt = {
      id: 'manual-1',
      documentId: 'doc-1',
      readingSessionId: null,
      kind: 'manual',
      startWordIndex: 0,
      endWordIndex: 100,
      wordCount: 100,
      durationSeconds: 60,
      targetWpm: 200,
      rawWpm: 100,
      comprehensionPercent: 70,
      adjustedWpm: 70,
      recommendedWpm: 200,
      explanation: 'Hold.',
      createdAt: '2026-05-12T10:01:00.000Z',
    } as unknown as QuizAttempt
    const retestAttempt = { ...manualAttempt, id: 'retest-1', kind: 'retest' } as unknown as QuizAttempt

    const normalized = normalizeQuizAttemptsForPersistence([manualAttempt, retestAttempt], [], 250)

    expect(normalized.map((attempt) => attempt.kind)).toEqual(['manual', 'retest'])
    expect(normalized.every((attempt) => attempt.scopeType === 'document')).toBe(true)
  })
})
