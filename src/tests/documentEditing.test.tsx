// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import {
  STRUCTURED_DOCUMENT_VERSION,
  createDefaultDocumentStructure,
} from '../app/structuredDocuments'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import type { DocumentRecord, QuizAttempt, ReadingSession } from '../types/domain'

const now = '2026-05-11T12:00:00.000Z'

function buildDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'document-1',
    title: 'Original Title',
    sourceType: 'paste',
    content: 'Original text stays linked to reader history.',
    wordCount: 7,
    estimatedPages: 1,
    language: 'en',
    structureVersion: STRUCTURED_DOCUMENT_VERSION,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  }
}

function buildSession(documentId: string): ReadingSession {
  return {
    id: 'session-1',
    documentId,
    mode: 'rail',
    targetWpm: 250,
    actualWpm: 240,
    adjustedWpm: 230,
    wordsRead: 20,
    durationSeconds: 5,
    startPosition: 0,
    endPosition: 20,
    pauseCount: 1,
    regressionCount: 0,
    comprehensionScore: 90,
    selfRating: null,
    notes: '',
    startedAt: now,
    endedAt: now,
  }
}

function buildQuizAttempt(documentId: string): QuizAttempt {
  return {
    id: 'quiz-1',
    documentId,
    readingSessionId: 'session-1',
    kind: 'generated',
    startWordIndex: 0,
    endWordIndex: 20,
    wordCount: 20,
    durationSeconds: 5,
    targetWpm: 250,
    rawWpm: 240,
    comprehensionPercent: 90,
    adjustedWpm: 230,
    recommendedWpm: 230,
    explanation: 'Keep going.',
    questionResults: [],
    questions: [],
    createdAt: now,
  }
}

function seedStore(document = buildDocument()): void {
  const structure = createDefaultDocumentStructure(document)
  useAppStore.setState({
    documents: [document],
    documentChapters: [structure.chapter],
    documentPages: [structure.page],
    sessions: [],
    activeDocumentId: document.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: now,
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library', 'reader', 'stats', 'settings'],
    },
    baselineResult: null,
    quizAttempts: [],
  })
}

async function openReader(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Original Title/i }))
  expect(screen.getByRole('heading', { name: 'Original Title' })).toBeTruthy()
}

beforeEach(() => {
  window.localStorage.clear()
  seedStore()
})

afterEach(() => {
  cleanup()
})

describe('saved document editing flows', () => {
  it('edits a saved document title from the library without duplicating it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const titleInput = screen.getByDisplayValue('Original Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Updated Library Title')
    await user.click(screen.getByRole('button', { name: 'Save title' }))

    await waitFor(() => expect(useAppStore.getState().documents[0].title).toBe('Updated Library Title'))
    expect(screen.getAllByText('Updated Library Title').length).toBeGreaterThan(0)
    const state = useAppStore.getState()
    expect(state.documents).toHaveLength(1)
    expect(state.documents[0]).toMatchObject({
      id: 'document-1',
      title: 'Updated Library Title',
      sourceType: 'paste',
    })
    expect(state.activeDocumentId).toBe('document-1')
  })

  it('falls back to the default title when a saved title is emptied', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByDisplayValue('Original Title'))
    await user.click(screen.getByRole('button', { name: 'Save title' }))

    await waitFor(() => expect(useAppStore.getState().documents[0].title).toBe('Untitled reading'))
    expect(screen.getAllByText('Untitled reading').length).toBeGreaterThan(0)
  })

  it('edits reader text and refreshes document and structured page metadata', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openReader(user)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const textArea = screen.getByLabelText('Text')
    await user.clear(textArea)
    await user.type(textArea, 'Updated reader text with exactly six words.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.documents[0]).toMatchObject({
        id: 'document-1',
        content: 'Updated reader text with exactly six words.',
        wordCount: 7,
        estimatedPages: 0,
      })
      expect(state.documentPages[0]).toMatchObject({
        documentId: 'document-1',
        text: 'Updated reader text with exactly six words.',
        wordCount: 7,
      })
    })
  })

  it('cancels reader edits without mutating the saved document', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openReader(user)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const titleInput = screen.getByDisplayValue('Original Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Draft Title')
    await user.clear(screen.getByLabelText('Text'))
    await user.type(screen.getByLabelText('Text'), 'Draft text should not save.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const state = useAppStore.getState()
    expect(state.documents[0]).toMatchObject({
      title: 'Original Title',
      content: 'Original text stays linked to reader history.',
      wordCount: 7,
    })
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('blocks empty reader text and preserves the previous saved text', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openReader(user)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByLabelText('Text'))
    await user.type(screen.getByLabelText('Text'), '   ')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Add reading text before saving.')).toBeTruthy()
    expect(useAppStore.getState().documents[0].content).toBe('Original text stays linked to reader history.')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  it('preserves history, archive state, and active selection when saving edits', () => {
    const document = buildDocument({
      archivedAt: '2026-05-12T12:00:00.000Z',
    })
    const structure = createDefaultDocumentStructure(document)
    const session = buildSession(document.id)
    const quizAttempt = buildQuizAttempt(document.id)
    useAppStore.setState({
      documents: [document],
      documentChapters: [structure.chapter],
      documentPages: [structure.page],
      sessions: [session],
      activeDocumentId: document.id,
      quizAttempts: [quizAttempt],
    })

    useAppStore.getState().updateDocument(document.id, {
      title: 'Preserved History',
      content: 'Edited content keeps the same document identity.',
    })

    const state = useAppStore.getState()
    expect(state.documents).toHaveLength(1)
    expect(state.documents[0]).toMatchObject({
      id: document.id,
      title: 'Preserved History',
      archivedAt: '2026-05-12T12:00:00.000Z',
      sourceType: 'paste',
    })
    expect(state.activeDocumentId).toBe(document.id)
    expect(state.sessions).toEqual([session])
    expect(state.quizAttempts).toEqual([quizAttempt])
  })
})
