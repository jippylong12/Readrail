// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { createDefaultDocumentStructure } from '../app/structuredDocuments'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import type { DocumentRecord } from '../types/domain'

const activeDocument: DocumentRecord = {
  id: 'document-1',
  title: 'Manual coaching document',
  sourceType: 'paste',
  content: 'Manual coaching checks should save comprehension without sending text to Gemini.',
  wordCount: 10,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-12T12:00:00.000Z',
  updatedAt: '2026-05-12T12:00:00.000Z',
  archivedAt: null,
}

function resetStore(): void {
  const structure = createDefaultDocumentStructure(activeDocument)
  useAppStore.setState({
    documents: [activeDocument],
    documentChapters: [structure.chapter],
    documentPages: [structure.page],
    ocrJobs: [],
    ocrJobItems: [],
    ocrRuntimeJobs: {},
    aiUsageLineItems: [],
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: activeDocument.createdAt,
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library-saved', 'reader', 'progress', 'costs', 'stats', 'settings'],
    },
    baselineResult: null,
    quizAttempts: [],
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/reader/document-1')
  resetStore()
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('manual coaching flow', () => {
  it('saves a manual comprehension check from the reader test flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', false))
    await user.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByRole('heading', { name: 'Quiz unavailable' })).toBeTruthy()

    await user.type(screen.getByLabelText('Comprehension percent'), '84')
    await user.click(screen.getByRole('button', { name: 'Save manual check' }))

    await waitFor(() => expect(window.location.pathname).toBe('/progress'))
    const state = useAppStore.getState()

    expect(state.sessions).toHaveLength(1)
    expect(state.quizAttempts[0]).toMatchObject({
      kind: 'manual',
      documentId: 'document-1',
      readingSessionId: state.sessions[0].id,
      comprehensionPercent: 84,
      questionResults: [],
      questions: [],
    })
    expect(screen.getAllByText('Manual check').length).toBeGreaterThan(0)
  })
})
