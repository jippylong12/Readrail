// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { getRouteForShortcutEvent, isEditableShortcutTarget } from '../app/shortcuts'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'
import type { DocumentRecord } from '../types/domain'

const activeDocument: DocumentRecord = {
  id: 'document-1',
  title: 'Shortcut test document',
  sourceType: 'paste',
  content: 'Keyboard navigation should move through each primary Readrail section.',
  wordCount: 9,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archivedAt: null,
}

function resetStore(): void {
  useAppStore.setState({
    documents: [activeDocument],
    sessions: [],
    activeDocumentId: activeDocument.id,
    onboarding: {
      ...defaultOnboardingState,
      status: 'skipped',
      skippedAt: new Date().toISOString(),
    },
    tourProgress: {
      ...defaultTourProgressState,
      completedTourIds: ['library', 'reader', 'stats', 'settings'],
    },
    baselineResult: null,
  })
}

function dispatchSectionShortcut(key: string, modifier: 'meta' | 'control'): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: modifier === 'control',
    key,
    metaKey: modifier === 'meta',
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  window.localStorage.clear()
  resetStore()
})

afterEach(() => {
  cleanup()
})

describe('app section shortcuts', () => {
  it('navigates primary sections with Command shortcuts', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()

    expect(dispatchSectionShortcut('r', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()

    expect(dispatchSectionShortcut('s', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()

    expect(dispatchSectionShortcut('g', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()

    expect(dispatchSectionShortcut('l', 'meta').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()
  })

  it('navigates primary sections with Control shortcuts', () => {
    render(<App />)

    expect(dispatchSectionShortcut('r', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: activeDocument.title })).toBeTruthy()

    expect(dispatchSectionShortcut('s', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Progress trends' })).toBeTruthy()

    expect(dispatchSectionShortcut('g', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()

    expect(dispatchSectionShortcut('l', 'control').defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()
  })

  it('does not navigate or prevent defaults while editing fields', async () => {
    const user = userEvent.setup()
    render(<App />)

    const titleInput = screen.getByLabelText('Title')
    await user.click(titleInput)

    const inputEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 's',
    })
    titleInput.dispatchEvent(inputEvent)

    expect(inputEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()

    const textArea = screen.getByLabelText('Text')
    const textAreaEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'g',
    })
    textArea.dispatchEvent(textAreaEvent)

    expect(textAreaEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Paste or text file' })).toBeTruthy()

    dispatchSectionShortcut('g', 'control')
    const select = screen.getByLabelText('Default mode')
    const selectEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'l',
    })
    select.dispatchEvent(selectEvent)

    expect(selectEvent.defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Privacy and defaults' })).toBeTruthy()
  })

  it('exposes visible and accessible shortcut hints on primary navigation', () => {
    render(<App />)

    const statsButton = screen.getByRole('button', { name: /Stats/i })

    expect(statsButton.getAttribute('aria-keyshortcuts')).toBe('Meta+S Control+S')
    expect(statsButton.getAttribute('title')).toBe('Stats (Command+S / Control+S)')
    expect(screen.getByText('⌘S')).toBeTruthy()
  })

  it('does not register section shortcuts during first-run onboarding', () => {
    useAppStore.setState({ onboarding: defaultOnboardingState })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Start with a baseline before the full app.' })).toBeTruthy()
    expect(dispatchSectionShortcut('s', 'control').defaultPrevented).toBe(false)
    expect(screen.getByRole('heading', { name: 'Start with a baseline before the full app.' })).toBeTruthy()
  })
})

describe('shortcut helpers', () => {
  it('ignores unrelated or already handled keyboard events', () => {
    const plainEvent = new KeyboardEvent('keydown', { key: 's' })
    const altEvent = new KeyboardEvent('keydown', { altKey: true, ctrlKey: true, key: 's' })
    const shiftedEvent = new KeyboardEvent('keydown', { ctrlKey: true, key: 's', shiftKey: true })
    const preventedEvent = new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key: 's' })

    preventedEvent.preventDefault()

    expect(getRouteForShortcutEvent(plainEvent)).toBeNull()
    expect(getRouteForShortcutEvent(altEvent)).toBeNull()
    expect(getRouteForShortcutEvent(shiftedEvent)).toBeNull()
    expect(getRouteForShortcutEvent(preventedEvent)).toBeNull()
  })

  it('detects editable targets that should keep normal typing behavior', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const contentEditable = document.createElement('div')
    const roleTextbox = document.createElement('div')
    const button = document.createElement('button')

    contentEditable.setAttribute('contenteditable', 'true')
    roleTextbox.setAttribute('role', 'textbox')

    expect(isEditableShortcutTarget(input)).toBe(true)
    expect(isEditableShortcutTarget(textarea)).toBe(true)
    expect(isEditableShortcutTarget(select)).toBe(true)
    expect(isEditableShortcutTarget(contentEditable)).toBe(true)
    expect(isEditableShortcutTarget(roleTextbox)).toBe(true)
    expect(isEditableShortcutTarget(button)).toBe(false)
  })
})
