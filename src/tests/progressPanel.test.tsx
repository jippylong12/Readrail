// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProgressPanel } from '../components/ProgressPanel'
import type { CoachingState, DocumentRecord, QuizAttempt, ReadingSession } from '../types/domain'

const documentRecord: DocumentRecord = {
  id: 'doc-1',
  title: 'Meaningful reading',
  sourceType: 'paste',
  content: 'Sample source text for progress review.',
  wordCount: 400,
  estimatedPages: 2,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  archivedAt: null,
}

const coaching: CoachingState = {
  recommendedWpm: 255,
  lastResetWordIndexByDocument: { 'doc-1': 300 },
  activeSegmentByDocument: {},
}

const attempt: QuizAttempt = {
  id: 'attempt-1',
  documentId: 'doc-1',
  readingSessionId: 'session-1',
  kind: 'generated',
  startWordIndex: 100,
  endWordIndex: 300,
  wordCount: 200,
  durationSeconds: 60,
  targetWpm: 240,
  rawWpm: 200,
  comprehensionPercent: 50,
  adjustedWpm: 100,
  recommendedWpm: 220,
  explanation: 'Comprehension dipped (50%). Slow to 220 WPM so understanding can catch up.',
  questionResults: [{ questionId: 'q1', selectedOptionId: 'b', score: 0, maxScore: 1 }],
  questions: [
    {
      questionId: 'q1',
      kind: 'inference',
      prompt: 'What can the reader infer from the decision?',
      options: [
        { id: 'a', label: 'The supported inference' },
        { id: 'b', label: 'An unsupported inference' },
        { id: 'c', label: 'A timing detail' },
        { id: 'd', label: 'A minor distraction' },
      ],
      correctOptionId: 'a',
      selectedOptionId: 'b',
      score: 0,
      maxScore: 1,
    },
  ],
  createdAt: '2026-05-10T09:15:00.000Z',
}

const session: ReadingSession = {
  id: 'session-1',
  documentId: 'doc-1',
  scopeType: 'document',
  scopeLabel: 'Full document',
  chapterId: null,
  chapterTitle: null,
  pageIds: [],
  pageNumbers: [],
  sourcePageNumbers: [],
  mode: 'rail',
  targetWpm: 240,
  actualWpm: 200,
  adjustedWpm: 100,
  wordsRead: 200,
  durationSeconds: 60,
  startPosition: 100,
  endPosition: 300,
  pauseCount: 0,
  regressionCount: 0,
  comprehensionScore: 50,
  selfRating: null,
  notes: '',
  startedAt: '2026-05-10T09:14:00.000Z',
  endedAt: '2026-05-10T09:15:00.000Z',
}

afterEach(() => {
  cleanup()
})

describe('ProgressPanel', () => {
  it('shows coaching summary, attempt table, and reviewable selected/correct answers', () => {
    render(<ProgressPanel coaching={coaching} documents={[documentRecord]} onOpenReader={vi.fn()} quizAttempts={[attempt]} sessions={[session]} />)

    expect(screen.getByRole('heading', { name: 'Coaching progress' })).toBeTruthy()
    expect(screen.getByText('255 WPM')).toBeTruthy()
    expect(screen.getAllByText('50%')).toHaveLength(2)
    expect(screen.getAllByText('Meaningful reading')).toHaveLength(2)
    expect(screen.getAllByText('100-300')).toHaveLength(2)
    expect(screen.getByText(/What can the reader infer from the decision/)).toBeTruthy()
    expect(screen.getByText('Selected')).toBeTruthy()
    expect(screen.getByText('Correct')).toBeTruthy()
    expect(screen.getByText('Incorrect')).toBeTruthy()
  })

  it('opens the reviewed document from the review panel', async () => {
    const user = userEvent.setup()
    const onOpenReader = vi.fn()
    render(<ProgressPanel coaching={coaching} documents={[documentRecord]} onOpenReader={onOpenReader} quizAttempts={[attempt]} sessions={[session]} />)

    await user.click(screen.getByRole('button', { name: 'Open reader' }))

    expect(onOpenReader).toHaveBeenCalledWith('doc-1')
  })

  it('renders quiz attempts for structured documents by document title', () => {
    const structuredDocument: DocumentRecord = {
      ...documentRecord,
      title: 'Structured OCR guide',
      sourceType: 'photo_ocr',
      content: 'First page.\n\n\f\n\nSecond page.',
    }

    render(<ProgressPanel coaching={coaching} documents={[structuredDocument]} onOpenReader={vi.fn()} quizAttempts={[attempt]} sessions={[session]} />)

    expect(screen.getAllByText('Structured OCR guide')).toHaveLength(2)
    expect(screen.getAllByText('100-300')).toHaveLength(2)
  })

  it('shows scoped session labels when available', () => {
    const scopedSession: ReadingSession = {
      ...session,
      scopeType: 'pages',
      scopeLabel: 'Chapter 2, pages 5-6',
      chapterId: 'chapter-2',
      chapterTitle: 'Chapter 2',
      pageIds: ['page-5', 'page-6'],
      pageNumbers: [5, 6],
      sourcePageNumbers: [12, 13],
    }

    render(<ProgressPanel coaching={coaching} documents={[documentRecord]} onOpenReader={vi.fn()} quizAttempts={[attempt]} sessions={[scopedSession]} />)

    expect(screen.getAllByText('Meaningful reading - Chapter 2, pages 5-6')).toHaveLength(2)
  })
})
