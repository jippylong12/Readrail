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
})
