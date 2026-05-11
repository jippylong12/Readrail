// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderControls } from '../components/ReaderControls'
import type { BaselineAssessmentResult, PageLayout } from '../types/domain'

const baselineResult: BaselineAssessmentResult = {
  id: 'baseline-1',
  storyTitle: 'Test story',
  storySource: 'default',
  wordCount: 250,
  durationSeconds: 60,
  rawWpm: 250,
  comprehensionPercent: 82,
  adjustedWpm: 205,
  recommendedWpm: 225,
  explanation: 'Start conservatively.',
  questionResults: [],
  completedAt: new Date().toISOString(),
  appliedWpmAt: new Date().toISOString(),
}

function renderControls(pageLayout: PageLayout = 1) {
  const onPageLayoutChange = vi.fn()
  render(
    <ReaderControls
      baselineResult={baselineResult}
      chunkSize={4}
      isFocusMode={false}
      isRunning={false}
      mode="rail"
      pageLayout={pageLayout}
      onChunkSizeChange={vi.fn()}
      onFocusModeToggle={vi.fn()}
      onFinish={vi.fn()}
      onModeChange={vi.fn()}
      onPageLayoutChange={onPageLayoutChange}
      onRegression={vi.fn()}
      onRewind={vi.fn()}
      onToggleRunning={vi.fn()}
      onWpmChange={vi.fn()}
      targetWpm={225}
    />,
  )
  return { onPageLayoutChange }
}

afterEach(() => {
  cleanup()
})

describe('ReaderControls', () => {
  it('explains each reader mode from the mode selector info button', async () => {
    const user = userEvent.setup()

    renderControls()

    expect(screen.getByRole('group', { name: 'Reading mode' })).toBeTruthy()
    expect(screen.queryByText(/Recommended default: guided lines and phrase highlights/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Explain reader modes' }))

    expect(screen.getByText(/Recommended default: guided lines and phrase highlights/i)).toBeTruthy()
    expect(screen.getByText(/Phrase grouping practice/i)).toBeTruthy()
    expect(screen.getByText(/Optional focused drill: less context and less rereading/i)).toBeTruthy()
    expect(screen.getByText(/Baseline: 250 raw WPM, 82% comprehension/i)).toBeTruthy()
    expect(screen.getByText(/do not optimize raw speed alone/i)).toBeTruthy()
  })

  it('renders a 1/2/3/4 page layout picker', () => {
    renderControls(1)

    expect(screen.getByRole('group', { name: 'Page count' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1 page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2 pages' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3 pages' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4 pages' })).toBeTruthy()
  })

  it('marks the active page count button as pressed', () => {
    renderControls(3)

    const button3 = screen.getByRole('button', { name: '3 pages' })
    expect(button3.getAttribute('aria-pressed')).toBe('true')

    const button1 = screen.getByRole('button', { name: '1 page' })
    expect(button1.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onPageLayoutChange with the chosen count', async () => {
    const user = userEvent.setup()
    const { onPageLayoutChange } = renderControls(1)

    await user.click(screen.getByRole('button', { name: '4 pages' }))

    expect(onPageLayoutChange).toHaveBeenCalledWith(4)
  })
})
