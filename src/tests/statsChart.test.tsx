// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatsChart } from '../components/StatsChart'
import type { BaselineAssessmentResult, DocumentRecord, ReadingSession } from '../types/domain'

const sampleDocument: DocumentRecord = {
  id: 'doc-1',
  title: 'Sample reading',
  sourceType: 'paste',
  content: 'Sample source text for tests.',
  wordCount: 100,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  archivedAt: null,
}

const baseline: BaselineAssessmentResult | null = {
  id: 'baseline-1',
  storyTitle: 'Baseline story',
  storySource: 'default',
  wordCount: 250,
  durationSeconds: 60,
  rawWpm: 250,
  comprehensionPercent: 82,
  adjustedWpm: 205,
  recommendedWpm: 225,
  explanation: 'Start conservatively.',
  questionResults: [],
  completedAt: '2026-05-01T00:00:00.000Z',
  appliedWpmAt: '2026-05-01T00:00:00.000Z',
}

const readingSession: ReadingSession = {
  id: 'session-1',
  documentId: 'doc-1',
  mode: 'rail',
  targetWpm: 240,
  actualWpm: 200,
  adjustedWpm: 170,
  wordsRead: 300,
  durationSeconds: 90,
  startPosition: 0,
  endPosition: 300,
  pauseCount: 1,
  regressionCount: 0,
  comprehensionScore: 85,
  selfRating: null,
  notes: '',
  startedAt: '2026-05-10T09:00:00.000Z',
  endedAt: '2026-05-10T09:01:30.000Z',
}

afterEach(() => {
  cleanup()
})

describe('StatsChart aggregate surface', () => {
  it('shows aggregate stats and baseline context without coaching review UI', () => {
    render(<StatsChart baselineResult={baseline} documents={[sampleDocument]} sessions={[readingSession]} />)

    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()
    expect(screen.getByText('Baseline story')).toBeTruthy()
    expect(screen.getByText('Words read')).toBeTruthy()
    expect(screen.queryByText('Latest Recommendation')).toBeNull()
    expect(screen.queryByText('Comprehension attempts')).toBeNull()
  })

  it('shows the empty chart state when there are no sessions', () => {
    render(<StatsChart baselineResult={null} documents={[sampleDocument]} sessions={[]} />)

    expect(screen.getByText('No sessions yet')).toBeTruthy()
    expect(screen.getByText(/populate comprehension-adjusted trends/)).toBeTruthy()
  })

  it('summarizes sessions for structured documents', () => {
    const structuredDocument: DocumentRecord = {
      ...sampleDocument,
      title: 'Structured OCR reading',
      sourceType: 'photo_ocr',
      content: 'Page one.\n\n\f\n\nPage two.',
      wordCount: 4,
      estimatedPages: 2,
    }

    render(<StatsChart baselineResult={null} documents={[structuredDocument]} sessions={[readingSession]} />)

    expect(screen.getByText('1 active documents')).toBeTruthy()
    expect(screen.getByText('Words read')).toBeTruthy()
    expect(screen.getAllByText('300')).toHaveLength(2)
  })

  it('keeps archived structured document sessions in stats while excluding them from active document count', () => {
    const archivedStructuredDocument: DocumentRecord = {
      ...sampleDocument,
      title: 'Archived OCR reading',
      sourceType: 'photo_ocr',
      content: 'Page one.\n\n\f\n\nPage two.',
      wordCount: 4,
      estimatedPages: 2,
      archivedAt: '2026-05-11T13:00:00.000Z',
    }

    render(<StatsChart baselineResult={null} documents={[archivedStructuredDocument]} sessions={[readingSession]} />)

    expect(screen.getByText('0 active documents')).toBeTruthy()
    expect(screen.getByText('Words read')).toBeTruthy()
    expect(screen.getAllByText('300')).toHaveLength(2)
  })
})
