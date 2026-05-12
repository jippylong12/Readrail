// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadingQuizPanel } from '../components/ReadingQuizPanel'

const quiz = {
  title: 'Reading check',
  questions: [
    {
      id: 'q1',
      kind: 'main_idea' as const,
      prompt: 'What is the main idea?',
      correctOptionId: 'q1-a',
      options: [
        { id: 'q1-a', label: 'Practice improves comprehension.' },
        { id: 'q1-b', label: 'Speed is the only goal.' },
        { id: 'q1-c', label: 'The passage is about weather.' },
        { id: 'q1-d', label: 'The passage rejects testing.' },
      ],
    },
    {
      id: 'q2',
      kind: 'detail' as const,
      prompt: 'Which detail is supported?',
      correctOptionId: 'q2-b',
      options: [
        { id: 'q2-a', label: 'Questions are skipped.' },
        { id: 'q2-b', label: 'Comprehension is checked.' },
        { id: 'q2-c', label: 'No results are stored.' },
        { id: 'q2-d', label: 'Settings are deleted.' },
      ],
    },
  ],
}

afterEach(() => {
  cleanup()
})

describe('ReadingQuizPanel', () => {
  it('shows the AI loading state', () => {
    render(
      <ReadingQuizPanel
        durationSeconds={60}
        error={null}
        isLoading
        onCancel={vi.fn()}
        onManualSubmit={vi.fn()}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        quiz={null}
        wordsRead={240}
      />,
    )

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(/Gemini is building questions/)).toBeTruthy()
  })

  it('submits selected quiz answers', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <ReadingQuizPanel
        durationSeconds={60}
        error={null}
        isLoading={false}
        onCancel={vi.fn()}
        onManualSubmit={vi.fn()}
        onRetry={vi.fn()}
        onSubmit={onSubmit}
        quiz={quiz}
        wordsRead={240}
      />,
    )

    await user.click(screen.getByLabelText('Practice improves comprehension.'))
    await user.click(screen.getByLabelText('Comprehension is checked.'))
    await user.click(screen.getByRole('button', { name: 'Save quiz result' }))

    expect(onSubmit).toHaveBeenCalledWith({ q1: 'q1-a', q2: 'q2-b' })
  })

  it('validates and submits manual comprehension when quiz generation fails', async () => {
    const user = userEvent.setup()
    const onManualSubmit = vi.fn()

    render(
      <ReadingQuizPanel
        durationSeconds={60}
        error="Add a Gemini API key in Settings before testing comprehension."
        isLoading={false}
        onCancel={vi.fn()}
        onManualSubmit={onManualSubmit}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        quiz={null}
        wordsRead={240}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Save manual check' }))
    expect(screen.getByText('Enter a comprehension score from 0 to 100.')).toBeTruthy()

    await user.type(screen.getByLabelText('Comprehension percent'), '101')
    await user.click(screen.getByRole('button', { name: 'Save manual check' }))
    expect(screen.getByText('Comprehension score must be between 0 and 100.')).toBeTruthy()

    await user.clear(screen.getByLabelText('Comprehension percent'))
    await user.type(screen.getByLabelText('Comprehension percent'), '87')
    await user.click(screen.getByRole('button', { name: 'Save manual check' }))

    expect(onManualSubmit).toHaveBeenCalledWith(87)
  })

  it('lets users choose manual scoring instead of the generated quiz', async () => {
    const user = userEvent.setup()
    const onManualSubmit = vi.fn()

    render(
      <ReadingQuizPanel
        durationSeconds={60}
        error={null}
        isLoading={false}
        onCancel={vi.fn()}
        onManualSubmit={onManualSubmit}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        quiz={quiz}
        wordsRead={240}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Enter manual score' }))
    await user.type(screen.getByLabelText('Comprehension percent'), '82')
    await user.click(screen.getByRole('button', { name: 'Save manual check' }))

    expect(onManualSubmit).toHaveBeenCalledWith(82)
  })
})
