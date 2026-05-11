// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatsChart } from '../components/StatsChart'
import type { BaselineAssessmentResult, DocumentRecord, QuizAttempt, ReadingSession } from '../types/domain'

const sampleDocument: DocumentRecord = {
  id: 'doc-1',
  title: 'Sample reading',
  sourceType: 'paste',
  content: 'Sample source text for tests.',
  wordCount: 100,
  estimatedPages: 1,
  language: 'en',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  archivedAt: null,
}

const readingSessions: ReadingSession[] = []

const baseline: BaselineAssessmentResult | null = null

const coachedAttempt: QuizAttempt = {
  id: 'attempt-1',
  documentId: 'doc-1',
  readingSessionId: null,
  kind: 'manual',
  wordCount: 240,
  durationSeconds: 72,
  rawWpm: 200,
  comprehensionPercent: 82,
  adjustedWpm: 190,
  recommendedWpm: 270,
  explanation: 'Great comprehension. Try a slightly higher pace.',
  createdAt: '2026-05-10T09:15:00.000Z',
}

const priorAttempt: QuizAttempt = {
  id: 'attempt-0',
  documentId: 'doc-1',
  readingSessionId: null,
  kind: 'generated',
  wordCount: 230,
  durationSeconds: 74,
  rawWpm: 190,
  comprehensionPercent: 80,
  adjustedWpm: 180,
  recommendedWpm: 255,
  explanation: 'Keep the same pace. Steady gains can come next round.',
  createdAt: '2026-05-09T09:15:00.000Z',
}

afterEach(() => {
  cleanup()
})

describe('StatsChart coaching surface', () => {
  it('shows latest recommendation and pace/comprehension deltas', () => {
    render(
      <StatsChart
        baselineResult={baseline}
        documents={[sampleDocument]}
        sessions={readingSessions}
        quizAttempts={[coachedAttempt, priorAttempt]}
        hasGeminiKey
      />,
    )

    expect(screen.getByRole('heading', { name: 'Latest Recommendation' })).toBeTruthy()
    expect(screen.getByText('Great comprehension. Try a slightly higher pace.')).toBeTruthy()
    expect(screen.getByText('+15 WPM')).toBeTruthy()
    expect(screen.getByText('+2 %')).toBeTruthy()
    expect(screen.getByText('Recent attempts')).toBeTruthy()
    expect(screen.getByText('Manual')).toBeTruthy()
    expect(screen.getByText('Generated')).toBeTruthy()
  })

  it('shows no recent assessment guidance when history is absent', () => {
    render(
      <StatsChart
        baselineResult={baseline}
        documents={[sampleDocument]}
        sessions={readingSessions}
        quizAttempts={[]}
        hasGeminiKey
      />,
    )

    expect(screen.getByText('No recent assessments')).toBeTruthy()
    expect(screen.getByText(/Complete a manual or generated comprehension check/)).toBeTruthy()
  })

  it('indicates the one-assessment state for coaching history', () => {
    render(
      <StatsChart
        baselineResult={baseline}
        documents={[sampleDocument]}
        sessions={readingSessions}
        quizAttempts={[coachedAttempt]}
        hasGeminiKey
      />,
    )

    expect(screen.getByText('One assessment recorded')).toBeTruthy()
  })

  it('shows coaching disabled state when the Gemini key is missing', () => {
    render(
      <StatsChart
        baselineResult={baseline}
        documents={[sampleDocument]}
        sessions={readingSessions}
        quizAttempts={[coachedAttempt, priorAttempt]}
        hasGeminiKey={false}
      />,
    )

    expect(screen.getByText('Coaching is disabled')).toBeTruthy()
    expect(
      screen.getByText(/Add a Gemini API key in Settings to enable generated quiz attempts and AI-based coaching recommendations/),
    ).toBeTruthy()
    expect(screen.queryByText('Great comprehension. Try a slightly higher pace.')).toBeNull()
  })
})
