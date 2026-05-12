// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  queryQuizAttemptsFromDatabase,
  saveQuizAttemptToDatabase,
} from '../lib/db/repository'
import { getDatabase } from '../lib/db/migrations'
import type { QuizAttempt } from '../types/domain'

vi.mock('../lib/db/migrations', () => ({
  getDatabase: vi.fn(),
  isTauriRuntime: vi.fn(() => false),
}))

const getDatabaseMock = vi.mocked(getDatabase)

describe('quiz attempt repository behavior', () => {
  beforeEach(() => {
    getDatabaseMock.mockReset()
  })

  it('upserts generated quiz attempts with scope and review metadata', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    await saveQuizAttemptToDatabase(buildAttempt())

    expect(database.execute).toHaveBeenCalledTimes(1)
    expect(database.execute.mock.calls[0][0]).toContain('INSERT INTO quiz_attempts')
    expect(database.execute.mock.calls[0][0]).toContain('ON CONFLICT(id) DO UPDATE SET')
    expect(database.execute.mock.calls[0][1]).toEqual([
      'attempt-1',
      'doc-1',
      'session-1',
      'generated',
      'pages',
      'Chapter 1, pages 2-3',
      'chapter-1',
      'Chapter 1',
      JSON.stringify(['page-2', 'page-3']),
      JSON.stringify([2, 3]),
      JSON.stringify([10, 11]),
      100,
      340,
      240,
      72,
      250,
      200,
      170,
      85,
      265,
      'Comprehension stayed strong.',
      JSON.stringify([{ questionId: 'q1', selectedOptionId: 'a', score: 1, maxScore: 1 }]),
      JSON.stringify([
        {
          questionId: 'q1',
          kind: 'main_idea',
          prompt: 'What is the main idea?',
          options: [{ id: 'a', label: 'The answer' }],
          correctOptionId: 'a',
          selectedOptionId: 'a',
          score: 1,
          maxScore: 1,
        },
      ]),
      '2026-05-12T12:00:00.000Z',
    ])
  })

  it('queries generated attempts with filters and normalizes review metadata', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([
        {
          id: 'attempt-legacy',
          document_id: 'doc-1',
          reading_session_id: 'session-1',
          kind: 'generated',
          scope_type: null,
          scope_label: null,
          chapter_id: null,
          chapter_title: null,
          page_ids_json: null,
          page_numbers_json: null,
          source_page_numbers_json: null,
          start_word_index: 0,
          end_word_index: 100,
          word_count: 100,
          duration_seconds: 30,
          target_wpm: 240,
          raw_wpm: 200,
          adjusted_wpm: 160,
          comprehension_percent: 80,
          recommended_wpm: 255,
          explanation: 'Try a small increase.',
          question_results_json: null,
          questions_json: null,
          created_at: '2026-05-12T12:00:00.000Z',
        },
      ]),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    const attempts = await queryQuizAttemptsFromDatabase({ documentId: 'doc-1', kind: 'generated' })

    expect(database.select.mock.calls[0][0]).toContain(
      'WHERE document_id = $1 AND kind = $2 ORDER BY created_at DESC',
    )
    expect(database.select.mock.calls[0][1]).toEqual(['doc-1', 'generated'])
    expect(attempts[0]).toMatchObject({
      id: 'attempt-legacy',
      kind: 'generated',
      scopeType: 'document',
      pageIds: [],
      pageNumbers: [],
      sourcePageNumbers: [],
      questionResults: [],
      questions: [],
    })
  })

  it('saves manual attempts without session or generated review data', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    await saveQuizAttemptToDatabase({
      ...buildAttempt(),
      id: 'manual-1',
      readingSessionId: null,
      kind: 'manual',
      scopeType: 'document',
      scopeLabel: null,
      chapterId: null,
      chapterTitle: null,
      pageIds: [],
      pageNumbers: [],
      sourcePageNumbers: [],
      questionResults: undefined,
      questions: undefined,
    })

    expect(database.execute.mock.calls[0][1][2]).toBeNull()
    expect(database.execute.mock.calls[0][1][3]).toBe('manual')
    expect(database.execute.mock.calls[0][1][21]).toBe('[]')
    expect(database.execute.mock.calls[0][1][22]).toBe('[]')
  })

  it('queries retest attempts with null session filters', async () => {
    const database = {
      execute: vi.fn(),
      select: vi.fn().mockResolvedValue([{ ...buildAttemptRow(), kind: 'retest', reading_session_id: null }]),
    }
    getDatabaseMock.mockResolvedValue(database as never)

    const attempts = await queryQuizAttemptsFromDatabase({ readingSessionId: null, kind: 'retest' })

    expect(database.select.mock.calls[0][0]).toContain(
      'WHERE reading_session_id IS NULL AND kind = $1 ORDER BY created_at DESC',
    )
    expect(database.select.mock.calls[0][1]).toEqual(['retest'])
    expect(attempts[0]).toMatchObject({ kind: 'retest', readingSessionId: null })
  })
})

function buildAttempt(): QuizAttempt {
  return {
    id: 'attempt-1',
    documentId: 'doc-1',
    readingSessionId: 'session-1',
    kind: 'generated',
    scopeType: 'pages',
    scopeLabel: 'Chapter 1, pages 2-3',
    chapterId: 'chapter-1',
    chapterTitle: 'Chapter 1',
    pageIds: ['page-2', 'page-3'],
    pageNumbers: [2, 3],
    sourcePageNumbers: [10, 11],
    startWordIndex: 100,
    endWordIndex: 340,
    wordCount: 240,
    durationSeconds: 72,
    targetWpm: 250,
    rawWpm: 200,
    adjustedWpm: 170,
    comprehensionPercent: 85,
    recommendedWpm: 265,
    explanation: 'Comprehension stayed strong.',
    questionResults: [{ questionId: 'q1', selectedOptionId: 'a', score: 1, maxScore: 1 }],
    questions: [
      {
        questionId: 'q1',
        kind: 'main_idea',
        prompt: 'What is the main idea?',
        options: [{ id: 'a', label: 'The answer' }],
        correctOptionId: 'a',
        selectedOptionId: 'a',
        score: 1,
        maxScore: 1,
      },
    ],
    createdAt: '2026-05-12T12:00:00.000Z',
  }
}

function buildAttemptRow() {
  return {
    id: 'attempt-1',
    document_id: 'doc-1',
    reading_session_id: 'session-1',
    kind: 'generated',
    scope_type: 'pages',
    scope_label: 'Chapter 1, pages 2-3',
    chapter_id: 'chapter-1',
    chapter_title: 'Chapter 1',
    page_ids_json: JSON.stringify(['page-2', 'page-3']),
    page_numbers_json: JSON.stringify([2, 3]),
    source_page_numbers_json: JSON.stringify([10, 11]),
    start_word_index: 100,
    end_word_index: 340,
    word_count: 240,
    duration_seconds: 72,
    target_wpm: 250,
    raw_wpm: 200,
    adjusted_wpm: 170,
    comprehension_percent: 85,
    recommended_wpm: 265,
    explanation: 'Comprehension stayed strong.',
    question_results_json: '[]',
    questions_json: '[]',
    created_at: '2026-05-12T12:00:00.000Z',
  }
}
