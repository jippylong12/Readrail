// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuidedTour } from '../components/GuidedTour'
import type { TourDefinition } from '../app/tours'

const tour: TourDefinition = {
  id: 'library',
  title: 'Library walkthrough',
  steps: [
    {
      target: '[data-tour="first"]',
      title: 'First step',
      body: 'First body.',
    },
    {
      target: '[data-tour="second"]',
      title: 'Second step',
      body: 'Second body.',
    },
  ],
}

afterEach(() => {
  cleanup()
})

describe('GuidedTour', () => {
  it('moves through steps and completes on the final step', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(
      <>
        <div data-tour="first">Import</div>
        <div data-tour="second">Library</div>
        <GuidedTour tour={tour} onComplete={onComplete} />
      </>,
    )

    expect(screen.getByRole('dialog', { name: 'Library walkthrough' })).toBeTruthy()
    expect(screen.getByText('First step')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Second step')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByText('First step')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
